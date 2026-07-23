import { ref, type Ref } from "vue";
import type {
  Peer,
  Room,
  SignalMessage,
  User,
  VoiceConnectionDiagnostic,
} from "~/types/ezcord";

interface UseEzcordVoiceOptions {
  activeRoom: Ref<Room | null>;
  user: Ref<User | null>;
  invite: Ref<string>;
  errorMessage: Ref<string>;
  statusMessage: Ref<string>;
}

interface IceConfigResponse {
  iceServers: RTCIceServer[];
  ttlSeconds: number;
}

export function useEzcordVoice({
  activeRoom,
  user,
  invite,
  errorMessage,
  statusMessage,
}: UseEzcordVoiceOptions) {
  const isMicOn = ref(false);
  const micLevel = ref(0);
  const isWaiting = ref(false);
  const waitingCount = ref(0);
  const localPeerId = ref("");
  const peers = ref<Peer[]>([]);
  const connectedPeerIds = ref<string[]>([]);
  const connectionDiagnostics = ref<VoiceConnectionDiagnostic[]>([]);
  const audioSink = ref<HTMLElement | null>(null);

  let mediaStream: MediaStream | null = null;
  let animationFrame = 0;
  let presenceTimer = 0;
  let signalTimer = 0;
  let wsPingTimer = 0;
  let wsFallbackTimer = 0;
  let lastSignalAt = "";
  let roomSocket: WebSocket | null = null;
  let isLeavingRoom = false;
  let micAudioContext: AudioContext | null = null;
  let audioUnlockInstalled = false;
  let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  let iceConfigExpiresAt = 0;
  let iceConfigRequest: Promise<RTCIceServer[]> | null = null;
  const audioUnlockMessage = "Нажмите MIC или экран, чтобы включить звук комнаты";
  const peerConnections = new Map<string, RTCPeerConnection>();
  const remoteAudios = new Map<string, HTMLAudioElement>();
  const pendingIceCandidates = new Map<string, RTCIceCandidateInit[]>();
  const makingOffers = new Map<string, boolean>();
  const ignoredOfferPeers = new Set<string>();

  async function toggleMic() {
    if (isWaiting.value) {
      statusMessage.value = "Место освободится — вы в очереди";
      return;
    }

    if (isMicOn.value) {
      stopMic();
      return;
    }

    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      isMicOn.value = true;
      watchMicLevel(mediaStream);
      await publishLocalTracks();
      await resumeRemoteAudios();
    } catch {
      errorMessage.value = "Микрофон недоступен";
    }
  }

  function stopMic(shouldRenegotiate = true) {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    }

    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    micAudioContext?.close().catch(() => {});
    micAudioContext = null;
    isMicOn.value = false;
    micLevel.value = 0;

    for (const connection of peerConnections.values()) {
      for (const sender of connection.getSenders()) {
        if (sender.track?.kind === "audio") {
          connection.removeTrack(sender);
        }
      }
    }
    if (shouldRenegotiate) {
      void renegotiateAll();
    }
  }

  function watchMicLevel(stream: MediaStream) {
    const AudioContextConstructor =
      window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextConstructor();
    micAudioContext?.close().catch(() => {});
    micAudioContext = audioContext;
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const samples = new Uint8Array(analyser.frequencyBinCount);

    analyser.fftSize = 256;
    source.connect(analyser);
    audioContext.resume?.().catch(() => {});

    const tick = () => {
      analyser.getByteFrequencyData(samples);
      const sum = samples.reduce((total, value) => total + value, 0);
      micLevel.value = Math.min(100, Math.round((sum / samples.length) * 1.6));
      animationFrame = requestAnimationFrame(tick);
    };

    tick();
  }

  function startSignaling() {
    if (!activeRoom.value) return;

    localPeerId.value = getRoomPeerId(
      activeRoom.value.id,
      user.value?.id || "user",
    );
    peers.value = [];
    connectedPeerIds.value = [];
    connectionDiagnostics.value = [];
    isWaiting.value = false;
    waitingCount.value = 0;
    lastSignalAt = "";
    isLeavingRoom = false;
    installAudioUnlockHandlers();

    if (typeof window !== "undefined" && "WebSocket" in window) {
      startWebSocketSignaling();
      return;
    }

    startPollingSignaling();
  }

  function startPollingSignaling() {
    if (!activeRoom.value || !localPeerId.value) return;

    void announcePresence();
    void pollSignals();

    presenceTimer = window.setInterval(() => void announcePresence(), 2500);
    signalTimer = window.setInterval(() => void pollSignals(), 900);
  }

  function cleanupVoice() {
    if (presenceTimer) {
      window.clearInterval(presenceTimer);
      presenceTimer = 0;
    }
    if (signalTimer) {
      window.clearInterval(signalTimer);
      signalTimer = 0;
    }
    if (wsPingTimer) {
      window.clearInterval(wsPingTimer);
      wsPingTimer = 0;
    }
    if (wsFallbackTimer) {
      window.clearTimeout(wsFallbackTimer);
      wsFallbackTimer = 0;
    }

    const socket = roomSocket;
    roomSocket = null;
    socket?.close(1000, "Cleanup");

    stopMic(false);
    for (const connection of peerConnections.values()) {
      connection.close();
    }
    peerConnections.clear();
    pendingIceCandidates.clear();
    makingOffers.clear();
    ignoredOfferPeers.clear();
    remoteAudios.forEach((audio) => audio.remove());
    remoteAudios.clear();
    removeAudioUnlockHandlers();
    peers.value = [];
    connectedPeerIds.value = [];
    isWaiting.value = false;
    waitingCount.value = 0;
    localPeerId.value = "";
    lastSignalAt = "";
  }

  async function leaveActiveRoom() {
    if (!activeRoom.value || !localPeerId.value) return;

    isLeavingRoom = true;
    if (roomSocket?.readyState === WebSocket.OPEN) {
      roomSocket.send(JSON.stringify({ type: "leave" }));
      roomSocket.close(1000, "Leave");
    }

    await $fetch(roomApiPath("leave"), {
      method: "POST",
      body: { peerId: localPeerId.value },
    }).catch(() => {});
  }

  function beaconLeaveActiveRoom() {
    if (
      !activeRoom.value ||
      !localPeerId.value ||
      typeof navigator === "undefined" ||
      !navigator.sendBeacon
    )
      return;

    const body = new Blob([JSON.stringify({ peerId: localPeerId.value })], {
      type: "application/json",
    });
    navigator.sendBeacon(roomApiPath("leave"), body);
  }

  async function announcePresence() {
    if (!activeRoom.value || !localPeerId.value) return;

    let response: { peers: Peer[]; waiting: boolean; waitingCount: number };
    try {
      response = await $fetch<{
        peers: Peer[];
        waiting: boolean;
        waitingCount: number;
      }>(roomApiPath("presence"), {
        method: "POST",
        body: { peerId: localPeerId.value },
      });
    } catch (error: any) {
      errorMessage.value =
        error?.data?.message || "Не получилось войти в комнату";
      activeRoom.value = null;
      cleanupVoice();
      return;
    }

    isWaiting.value = response.waiting;
    waitingCount.value = response.waitingCount;
    await syncPeers(response.peers);
  }

  function startWebSocketSignaling() {
    if (!activeRoom.value || !localPeerId.value) return;

    let opened = false;
    const socket = new WebSocket(roomWsPath());
    roomSocket = socket;

    wsFallbackTimer = window.setTimeout(() => {
      if (opened || roomSocket !== socket) return;
      roomSocket = null;
      socket.close();
      startPollingSignaling();
    }, 3500);

    socket.onopen = () => {
      opened = true;
      if (wsFallbackTimer) {
        window.clearTimeout(wsFallbackTimer);
        wsFallbackTimer = 0;
      }
      wsPingTimer = window.setInterval(() => {
        if (roomSocket?.readyState === WebSocket.OPEN) {
          roomSocket.send(JSON.stringify({ type: "ping" }));
        }
      }, 20000);
    };

    socket.onmessage = (event) => {
      void handleSocketMessage(event);
    };

    socket.onerror = () => {
      if (!opened && roomSocket === socket) {
        roomSocket = null;
        startPollingSignaling();
      }
    };

    socket.onclose = (event) => {
      if (wsPingTimer) {
        window.clearInterval(wsPingTimer);
        wsPingTimer = 0;
      }
      if (wsFallbackTimer) {
        window.clearTimeout(wsFallbackTimer);
        wsFallbackTimer = 0;
      }
      if (roomSocket === socket) {
        roomSocket = null;
      }

      if (event.reason === "Replaced") {
        statusMessage.value = "Открыто новое подключение";
        activeRoom.value = null;
        cleanupVoice();
        return;
      }

      if (isLeavingRoom || !activeRoom.value) return;

      if (event.code === 4003) {
        errorMessage.value = "Вас кикнули из комнаты";
        activeRoom.value = null;
        cleanupVoice();
        return;
      }

      if (!presenceTimer) {
        statusMessage.value = "WebSocket недоступен, включен fallback";
        startPollingSignaling();
      }
    };
  }

  async function handleSocketMessage(event: MessageEvent) {
    let message: any;
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }

    if (message.type === "peers") {
      isWaiting.value = Boolean(message.waiting);
      waitingCount.value = Number(message.waitingCount || 0);
      await syncPeers(message.peers || []);
      return;
    }

    if (message.type === "room_settings" && message.room) {
      if (activeRoom.value) {
        activeRoom.value = {
          ...activeRoom.value,
          name: message.room.name,
          game: message.room.game,
          goal: message.room.goal,
        };
      }
      return;
    }

    if (message.type === "slot_available") {
      if (roomSocket?.readyState === WebSocket.OPEN) {
        roomSocket.send(JSON.stringify({ type: "ping" }));
      }
      return;
    }

    if (message.type === "ready" || message.type === "waiting") {
      isWaiting.value = Boolean(message.waiting);
      waitingCount.value = Number(message.waitingCount || 0);
      if (isWaiting.value) {
        await syncPeers(peers.value);
      }
      return;
    }

    if (message.type === "signal" && message.signal) {
      lastSignalAt = message.signal.createdAt || lastSignalAt;
      await handleSignal(message.signal);
      return;
    }

    if (message.type === "kicked") {
      errorMessage.value = message.message || "Вас кикнули из комнаты";
      activeRoom.value = null;
      cleanupVoice();
      return;
    }

    if (message.type === "replaced") {
      statusMessage.value = message.message || "Открыто новое подключение";
      activeRoom.value = null;
      cleanupVoice();
      return;
    }

    if (message.type === "error") {
      errorMessage.value = message.message || "Ошибка голосовой комнаты";
    }
  }

  async function syncPeers(remotePeers: Peer[]) {
    const visiblePeers = normalizeRemotePeers(remotePeers);
    peers.value = visiblePeers;
    const remoteIds = new Set(visiblePeers.map((peer) => peer.peerId));

    if (isWaiting.value) {
      for (const peerId of Array.from(peerConnections.keys())) {
        closePeer(peerId);
      }
      return;
    }

    for (const peer of visiblePeers) {
      await ensurePeerConnection(peer.peerId, localPeerId.value < peer.peerId);
    }

    for (const peerId of Array.from(peerConnections.keys())) {
      if (!remoteIds.has(peerId)) {
        closePeer(peerId);
      }
    }
  }

  async function kickPeer(peerId: string) {
    if (!activeRoom.value) return;

    try {
      await $fetch(roomApiPath(`peers/${peerId}`), { method: "DELETE" });
      closePeer(peerId);
      peers.value = peers.value.filter((peer) => peer.peerId !== peerId);
    } catch (error: any) {
      errorMessage.value =
        error?.data?.message || "Не получилось кикнуть участника";
    }
  }

  async function pollSignals() {
    if (!activeRoom.value || !localPeerId.value) return;

    const query = new URLSearchParams({ peerId: localPeerId.value });
    if (lastSignalAt) query.set("after", lastSignalAt);
    if (invite.value) query.set("invite", invite.value);

    const response = await $fetch<{ signals: SignalMessage[] }>(
      `/api/ezcord/rooms/${activeRoom.value.id}/signals?${query}`,
    );

    for (const signal of response.signals) {
      lastSignalAt = signal.createdAt;
      await handleSignal(signal);
    }
  }

  async function handleSignal(signal: SignalMessage) {
    const connection = await ensurePeerConnection(signal.fromPeerId, false);

    if (signal.type === "offer") {
      const offerCollision =
        Boolean(makingOffers.get(signal.fromPeerId)) ||
        connection.signalingState !== "stable";
      const polite = localPeerId.value > signal.fromPeerId;

      if (offerCollision && !polite) {
        ignoredOfferPeers.add(signal.fromPeerId);
        return;
      }

      ignoredOfferPeers.delete(signal.fromPeerId);
      if (offerCollision) {
        await connection
          .setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit)
          .catch(() => {});
      }

      await connection.setRemoteDescription(
        new RTCSessionDescription(signal.payload),
      );
      await flushQueuedIceCandidates(signal.fromPeerId, connection);
      await addLocalTracks(connection);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await sendSignal(signal.fromPeerId, "answer", answer);
      return;
    }

    if (signal.type === "answer") {
      ignoredOfferPeers.delete(signal.fromPeerId);
      if (connection.signalingState !== "stable") {
        await connection.setRemoteDescription(
          new RTCSessionDescription(signal.payload),
        );
        await flushQueuedIceCandidates(signal.fromPeerId, connection);
      }
      return;
    }

    if (signal.type === "candidate") {
      if (ignoredOfferPeers.has(signal.fromPeerId)) return;

      if (!connection.remoteDescription) {
        queueIceCandidate(signal.fromPeerId, signal.payload);
        return;
      }
      await connection
        .addIceCandidate(new RTCIceCandidate(signal.payload))
        .catch(() => {});
    }
  }

  async function ensurePeerConnection(peerId: string, shouldOffer: boolean) {
    const existing = peerConnections.get(peerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({
      iceServers: await getIceServers(),
    });

    peerConnections.set(peerId, connection);
    upsertConnectionDiagnostic(peerId, {
      connectionState: connection.connectionState,
      iceConnectionState: connection.iceConnectionState,
      hasRemoteAudioTrack: false,
      autoplayBlocked: false,
    });
    if (mediaStream) {
      await addLocalTracks(connection);
    } else {
      connection.addTransceiver("audio", { direction: "recvonly" });
    }

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal(peerId, "candidate", event.candidate.toJSON());
      }
    };

    connection.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) {
        upsertConnectionDiagnostic(peerId, { hasRemoteAudioTrack: true });
        attachRemoteAudio(peerId, stream);
      }
    };

    connection.onconnectionstatechange = () => {
      updateConnectedPeers();
      void refreshConnectionDiagnostic(peerId, connection);
    };
    connection.oniceconnectionstatechange = () => {
      updateConnectedPeers();
      void refreshConnectionDiagnostic(peerId, connection);
    };

    if (shouldOffer) {
      await createOffer(peerId, connection);
    }

    return connection;
  }

  async function createOffer(
    peerId: string,
    connection = peerConnections.get(peerId),
  ) {
    if (!connection) return;
    if (connection.signalingState !== "stable") return;

    makingOffers.set(peerId, true);
    try {
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await sendSignal(peerId, "offer", offer);
    } finally {
      makingOffers.delete(peerId);
    }
  }

  async function sendSignal(
    toPeerId: string,
    type: SignalMessage["type"],
    payload: any,
  ) {
    if (!activeRoom.value || !localPeerId.value) return;

    if (roomSocket?.readyState === WebSocket.OPEN) {
      roomSocket.send(
        JSON.stringify({
          type: "signal",
          toPeerId,
          signalType: type,
          payload,
        }),
      );
      return;
    }

    await $fetch(roomApiPath("signals"), {
      method: "POST",
      body: {
        fromPeerId: localPeerId.value,
        toPeerId,
        type,
        payload,
      },
    });
  }

  async function addLocalTracks(connection: RTCPeerConnection) {
    if (!mediaStream) return;
    const hasAudioSender = connection
      .getSenders()
      .some((sender) => sender.track?.kind === "audio");
    if (hasAudioSender) return;

    const track = mediaStream.getAudioTracks()[0];
    if (!track) return;

    const idleTransceiver = connection
      .getTransceivers()
      .find(
        (transceiver) =>
          transceiver.receiver.track.kind === "audio" &&
          !transceiver.sender.track,
      );

    if (idleTransceiver) {
      await idleTransceiver.sender.replaceTrack(track);
      idleTransceiver.direction = "sendrecv";
    } else {
      connection.addTrack(track, mediaStream);
    }
  }

  async function publishLocalTracks() {
    for (const [peerId, connection] of peerConnections.entries()) {
      await addLocalTracks(connection);
      await createOffer(peerId, connection);
    }
  }

  async function renegotiateAll() {
    for (const [peerId, connection] of peerConnections.entries()) {
      if (connection.connectionState !== "closed") {
        await createOffer(peerId, connection).catch(() => {});
      }
    }
  }

  function attachRemoteAudio(peerId: string, stream: MediaStream) {
    let audio = remoteAudios.get(peerId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.peerId = peerId;
      audioSink.value?.appendChild(audio);
      remoteAudios.set(peerId, audio);
    }
    audio.srcObject = stream;
    appendRemoteAudio(audio);
    void playRemoteAudio(audio);
  }

  function closePeer(peerId: string) {
    peerConnections.get(peerId)?.close();
    peerConnections.delete(peerId);
    pendingIceCandidates.delete(peerId);
    makingOffers.delete(peerId);
    ignoredOfferPeers.delete(peerId);
    remoteAudios.get(peerId)?.remove();
    remoteAudios.delete(peerId);
    connectionDiagnostics.value = connectionDiagnostics.value.filter(
      (item) => item.peerId !== peerId,
    );
    updateConnectedPeers();
  }

  function updateConnectedPeers() {
    connectedPeerIds.value = Array.from(peerConnections.entries())
      .filter(([, connection]) =>
        ["connected", "completed"].includes(connection.connectionState),
      )
      .map(([peerId]) => peerId);
  }

  function setAudioSink(element: HTMLElement | null) {
    audioSink.value = element;
    if (element) {
      remoteAudios.forEach((audio) => appendRemoteAudio(audio));
      void resumeRemoteAudios();
    }
  }

  async function getIceServers() {
    if (Date.now() < iceConfigExpiresAt) return iceServers;
    if (iceConfigRequest) return await iceConfigRequest;

    iceConfigRequest = $fetch<IceConfigResponse>("/api/ezcord/voice/ice")
      .then((response) => {
        if (response.iceServers?.length) {
          iceServers = response.iceServers;
          iceConfigExpiresAt =
            Date.now() + Math.max(60, response.ttlSeconds - 60) * 1000;
        }
        return iceServers;
      })
      .catch(() => iceServers)
      .finally(() => {
        iceConfigRequest = null;
      });

    return await iceConfigRequest;
  }

  function appendRemoteAudio(audio: HTMLAudioElement) {
    const container = audioSink.value || document.body;
    if (audio.parentElement !== container) {
      container.appendChild(audio);
    }
  }

  async function playRemoteAudio(audio: HTMLAudioElement) {
    const peerId = audio.dataset.peerId || "";
    audio.muted = false;
    audio.volume = 1;
    try {
      await audio.play();
      if (statusMessage.value === audioUnlockMessage) {
        statusMessage.value = "";
      }
      if (peerId) {
        upsertConnectionDiagnostic(peerId, { autoplayBlocked: false });
      }
    } catch {
      if (peerId) {
        upsertConnectionDiagnostic(peerId, { autoplayBlocked: true });
      }
      statusMessage.value = audioUnlockMessage;
    }
  }

  async function resumeRemoteAudios() {
    await Promise.all(
      Array.from(remoteAudios.values()).map((audio) => playRemoteAudio(audio)),
    );
  }

  function queueIceCandidate(peerId: string, payload: RTCIceCandidateInit) {
    const queued = pendingIceCandidates.get(peerId) || [];
    queued.push(payload);
    pendingIceCandidates.set(peerId, queued);
  }

  async function flushQueuedIceCandidates(
    peerId: string,
    connection: RTCPeerConnection,
  ) {
    if (!connection.remoteDescription) return;

    const queued = pendingIceCandidates.get(peerId);
    if (!queued?.length) return;

    pendingIceCandidates.delete(peerId);
    for (const payload of queued) {
      await connection
        .addIceCandidate(new RTCIceCandidate(payload))
        .catch(() => {});
    }
  }

  function installAudioUnlockHandlers() {
    if (audioUnlockInstalled || typeof document === "undefined") return;
    audioUnlockInstalled = true;
    document.addEventListener("pointerdown", handleAudioUnlock, {
      passive: true,
    });
    document.addEventListener("touchend", handleAudioUnlock, { passive: true });
  }

  function removeAudioUnlockHandlers() {
    if (!audioUnlockInstalled || typeof document === "undefined") return;
    audioUnlockInstalled = false;
    document.removeEventListener("pointerdown", handleAudioUnlock);
    document.removeEventListener("touchend", handleAudioUnlock);
  }

  function handleAudioUnlock() {
    void resumeRemoteAudios();
  }

  function upsertConnectionDiagnostic(
    peerId: string,
    patch: Partial<VoiceConnectionDiagnostic>,
  ) {
    const current = connectionDiagnostics.value.find(
      (item) => item.peerId === peerId,
    ) || {
      peerId,
      connectionState: "new" as const,
      iceConnectionState: "new" as const,
      hasRemoteAudioTrack: false,
      autoplayBlocked: false,
    };

    const next = { ...current, ...patch };
    connectionDiagnostics.value = connectionDiagnostics.value
      .filter((item) => item.peerId !== peerId)
      .concat(next);
  }

  async function refreshConnectionDiagnostic(
    peerId: string,
    connection: RTCPeerConnection,
  ) {
    const patch: Partial<VoiceConnectionDiagnostic> = {
      connectionState: connection.connectionState,
      iceConnectionState: connection.iceConnectionState,
    };

    const selectedCandidateType = await getSelectedCandidateType(connection);
    if (selectedCandidateType) {
      patch.selectedCandidateType = selectedCandidateType;
    }

    upsertConnectionDiagnostic(peerId, patch);
  }

  async function getSelectedCandidateType(connection: RTCPeerConnection) {
    const stats = await connection.getStats().catch(() => null);
    if (!stats) return "";

    let localCandidateId = "";
    stats.forEach((report: any) => {
      if (localCandidateId || report.type !== "candidate-pair") return;
      if (
        report.selected ||
        (report.nominated && report.state === "succeeded")
      ) {
        localCandidateId = report.localCandidateId || "";
      }
    });

    const candidate = localCandidateId
      ? (stats.get(localCandidateId) as any)
      : null;
    return String(candidate?.candidateType || "");
  }

  function roomApiPath(action: string) {
    if (!activeRoom.value) return "";
    const query = invite.value
      ? `?invite=${encodeURIComponent(invite.value)}`
      : "";
    return `/api/ezcord/rooms/${activeRoom.value.id}/${action}${query}`;
  }

  function roomWsPath() {
    const query = new URLSearchParams({
      roomId: activeRoom.value?.id || "",
      peerId: localPeerId.value,
    });
    if (invite.value) query.set("invite", invite.value);

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/api/ezcord/ws?${query.toString()}`;
  }

  function randomClientId() {
    return `peer_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }

  function getRoomPeerId(roomId: string, userId: string) {
    if (typeof window === "undefined") return randomClientId();

    const key = `ezcord-peer:${userId}:${roomId}`;
    const savedPeerId = window.localStorage.getItem(key);
    if (savedPeerId) return savedPeerId;

    const peerId = randomClientId();
    window.localStorage.setItem(key, peerId);
    return peerId;
  }

  function normalizeRemotePeers(remotePeers: Peer[]) {
    const selfUserId = user.value?.id || "";
    const latestByUser = new Map<string, Peer>();

    for (const peer of remotePeers) {
      if (selfUserId && peer.userId === selfUserId) continue;

      const key = peer.userId || peer.peerId;
      const existing = latestByUser.get(key);
      if (
        !existing ||
        new Date(peer.lastSeenAt).getTime() >=
          new Date(existing.lastSeenAt).getTime()
      ) {
        latestByUser.set(key, peer);
      }
    }

    return Array.from(latestByUser.values());
  }

  return {
    connectedPeerIds,
    connectionDiagnostics,
    isWaiting,
    isMicOn,
    kickPeer,
    leaveActiveRoom,
    beaconLeaveActiveRoom,
    cleanupVoice,
    micLevel,
    peers,
    setAudioSink,
    startSignaling,
    toggleMic,
    waitingCount,
  };
}
