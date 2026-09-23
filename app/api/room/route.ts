import { NextResponse } from "next/server";

const globalRooms = globalThis as unknown as {
  __GAME_ROOMS__?: Record<string, any>;
};

if (!globalRooms.__GAME_ROOMS__) {
  globalRooms.__GAME_ROOMS__ = {};
}

const rooms = globalRooms.__GAME_ROOMS__;

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId")?.toUpperCase();

  if (!roomId || !rooms[roomId]) {
    return NextResponse.json(
      { error: "Room not found" },
      { status: 404, headers: noCacheHeaders }
    );
  }

  return NextResponse.json(rooms[roomId], { headers: noCacheHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, roomId: rawRoomId, data } = body;
    const roomId = rawRoomId?.toUpperCase();

    if (!roomId) {
      return NextResponse.json(
        { error: "Missing roomId" },
        { status: 400, headers: noCacheHeaders }
      );
    }

    if (action === "CREATE") {
      rooms[roomId] = {
        id: roomId,
        status: "LOBBY",
        defuserJoined: false,
        targetWord: "",
        secretKey: "",
        cipherHex: "",
        timeLimit: 120,
        startTime: null,
        lastUpdate: Date.now(),
      };
      return NextResponse.json(
        { success: true, room: rooms[roomId] },
        { headers: noCacheHeaders }
      );
    }

    if (action === "JOIN") {
      if (!rooms[roomId]) {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404, headers: noCacheHeaders }
        );
      }
      rooms[roomId].defuserJoined = true;
      rooms[roomId].lastUpdate = Date.now();
      return NextResponse.json(
        { success: true, room: rooms[roomId] },
        { headers: noCacheHeaders }
      );
    }

    if (action === "ARM") {
      if (!rooms[roomId]) {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404, headers: noCacheHeaders }
        );
      }
      rooms[roomId] = {
        ...rooms[roomId],
        ...data,
        status: "PLAYING",
        startTime: Date.now(),
        lastUpdate: Date.now(),
      };
      return NextResponse.json(
        { success: true, room: rooms[roomId] },
        { headers: noCacheHeaders }
      );
    }

    // จุดตรวจคำตอบ: คลีนช่องว่างและแปลงเป็นตัวพิมพ์ใหญ่ทั้งสองฝั่งก่อนเทียบ
    if (action === "SUBMIT") {
      if (!rooms[roomId]) {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404, headers: noCacheHeaders }
        );
      }
      
      const userAnswer = String(data.answer || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const correctAnswer = String(rooms[roomId].targetWord || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

      const isCorrect = userAnswer === correctAnswer;
      rooms[roomId].status = isCorrect ? "DEFUSED" : "EXPLODED";
      rooms[roomId].lastUpdate = Date.now();

      return NextResponse.json(
        { 
          success: true, 
          room: rooms[roomId], 
          isCorrect,
          userAnswer,
          correctAnswer 
        },
        { headers: noCacheHeaders }
      );
    }

    if (action === "EXPLODE") {
      if (!rooms[roomId]) {
        return NextResponse.json(
          { error: "Room not found" },
          { status: 404, headers: noCacheHeaders }
        );
      }
      rooms[roomId].status = "EXPLODED";
      rooms[roomId].lastUpdate = Date.now();
      return NextResponse.json(
        { success: true, room: rooms[roomId] },
        { headers: noCacheHeaders }
      );
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400, headers: noCacheHeaders }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500, headers: noCacheHeaders }
    );
  }
}