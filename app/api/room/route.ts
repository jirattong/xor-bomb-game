import { NextResponse } from "next/server";

// หน่วยความจำชั่วคราวสำหรับเก็บสถานะห้องเล่น
const rooms: Record<string, any> = {};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");

  if (!roomId || !rooms[roomId]) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json(rooms[roomId]);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, roomId, data } = body;

  if (action === "CREATE") {
    rooms[roomId] = {
      id: roomId,
      status: "WAITING",
      targetWord: "",
      secretKey: "",
      cipherHex: "",
      cipherBinary: "",
      timeLimit: 120,
      startTime: null,
      lastUpdate: Date.now(),
    };
    return NextResponse.json({ success: true, room: rooms[roomId] });
  }

  if (action === "ARM") {
    if (!rooms[roomId]) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    rooms[roomId] = {
      ...rooms[roomId],
      ...data,
      status: "PLAYING",
      startTime: Date.now(),
      lastUpdate: Date.now(),
    };
    return NextResponse.json({ success: true, room: rooms[roomId] });
  }

  if (action === "SUBMIT") {
    if (!rooms[roomId]) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    const isCorrect = data.answer.trim().toUpperCase() === rooms[roomId].targetWord.toUpperCase();
    rooms[roomId].status = isCorrect ? "DEFUSED" : "EXPLODED";
    rooms[roomId].lastUpdate = Date.now();
    return NextResponse.json({ success: true, room: rooms[roomId], isCorrect });
  }

  if (action === "EXPLODE") {
    if (!rooms[roomId]) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    rooms[roomId].status = "EXPLODED";
    rooms[roomId].lastUpdate = Date.now();
    return NextResponse.json({ success: true, room: rooms[roomId] });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}