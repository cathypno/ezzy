export default defineEventHandler(async (event) => {
  const { room } = await requireRoomAccess(event);
  await checkEzcordRateLimit(event, "signals", 900);

  const body = await readBody<{
    fromPeerId?: string;
    toPeerId?: string;
    type?: "offer" | "answer" | "candidate";
    payload?: any;
  }>(event);

  if (!body.fromPeerId || !body.toPeerId || !body.type || !body.payload) {
    throw createError({ statusCode: 400, message: "Неполный signal payload" });
  }

  if (!["offer", "answer", "candidate"].includes(body.type)) {
    throw createError({ statusCode: 400, message: "Неверный signal type" });
  }

  const signal = await appendEzcordSignal({
    roomId: room.id,
    fromPeerId: body.fromPeerId,
    toPeerId: body.toPeerId,
    type: body.type,
    payload: body.payload,
  });

  return { ok: true, signal };
});
