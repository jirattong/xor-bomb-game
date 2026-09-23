"use client";

import React, { useState, useEffect, useRef } from "react";

const toAsciiBinArray = (char: string): number[] => {
  if (!char) return [0, 0, 0, 0, 0, 0, 0, 0];
  return char
    .charCodeAt(0)
    .toString(2)
    .padStart(8, "0")
    .split("")
    .map(Number);
};

export default function BombDefuseApp() {
  const [role, setRole] = useState<"MENU" | "OPERATOR_SETUP" | "OPERATOR_LOBBY" | "DEFUSER">("MENU");
  const [roomId, setRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState("");

  // Game Settings & Room Status
  const [targetWord, setTargetWord] = useState("CAT");
  const [secretKey, setSecretKey] = useState("BAT");
  const [timeLimit, setTimeLimit] = useState(120);
  const [timeLeft, setTimeLeft] = useState(0);
  const [gameStatus, setGameStatus] = useState<"LOBBY" | "PLAYING" | "DEFUSED" | "EXPLODED">("LOBBY");
  const [defuserJoined, setDefuserJoined] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Defuser Gameplay (Bit Toggling)
  const [defuserKey, setDefuserKey] = useState("");
  const [cipherHex, setCipherHex] = useState("");
  const [cipherBytes, setCipherBytes] = useState<number[][]>([]);
  const [keyBytes, setKeyBytes] = useState<number[][]>([]);
  
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [userBits, setUserBits] = useState<number[][]>([[0,0,0,0,0,0,0,0]]);

  const pollInterval = useRef<any>(null);

  // คำนวณคำศัพท์ที่ได้จากบิตปัจจุบัน
  const currentDecodedWord = userBits
    .map((byte) => {
      const code = parseInt(byte.join(""), 2);
      return code >= 32 && code <= 126 ? String.fromCharCode(code) : "?";
    })
    .join("");

  // 1. ผู้ตั้งรหัสบันทึกและสร้างห้อง
  const handleSaveAndCreateRoom = async () => {
    const t = (targetWord || "CAT").trim().toUpperCase();
    const k = (secretKey || "BAT").trim().toUpperCase();

    if (!t || !k) return alert("กรุณากรอกทั้งคำศัพท์และ Key");
    if (t.length !== k.length) return alert("คำศัพท์และ Key ต้องมีความยาวเท่ากัน!");

    setIsSubmitting(true);
    const newId = Math.random().toString(36).substring(2, 6).toUpperCase();

    let hex = "";
    for (let i = 0; i < t.length; i++) {
      hex += (t.charCodeAt(i) ^ k.charCodeAt(i)).toString(16).padStart(2, "0").toUpperCase();
    }

    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CREATE", roomId: newId }),
      });

      if (res.ok) {
        setRoomId(newId);
        setTargetWord(t);
        setSecretKey(k);
        setCipherHex(hex);
        setRole("OPERATOR_LOBBY");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. ผู้กู้ระเบิดจอยเข้าห้อง
  const handleJoinRoom = async () => {
    if (!inputRoomId.trim()) return alert("กรุณาใส่รหัสห้อง 4 หลัก");
    const code = inputRoomId.trim().toUpperCase();

    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "JOIN", roomId: code }),
      });

      if (res.ok) {
        setRoomId(code);
        setRole("DEFUSER");
      } else {
        alert("ไม่พบรหัสห้องนี้ กรุณาตรวจสอบว่าผู้ตั้งรหัสกดสร้างห้องแล้วหรือยัง");
      }
    } catch {
      alert("เชื่อมต่อขัดข้อง");
    }
  };

  // Polling ข้อมูล Realtime
  useEffect(() => {
    if (!roomId || role === "MENU" || role === "OPERATOR_SETUP") return;

    const fetchRoom = async () => {
      try {
        const res = await fetch(`/api/room?roomId=${roomId}`);
        if (!res.ok) return;
        const data = await res.json();

        setGameStatus(data.status);
        setDefuserJoined(Boolean(data.defuserJoined));

        if (data.status === "PLAYING") {
          setDefuserKey(data.secretKey);
          setCipherHex(data.cipherHex);

          if (data.cipherHex && cipherBytes.length === 0) {
            const cBytes: number[][] = [];
            for (let i = 0; i < data.cipherHex.length; i += 2) {
              const val = parseInt(data.cipherHex.substr(i, 2), 16);
              cBytes.push(val.toString(2).padStart(8, "0").split("").map(Number));
            }
            setCipherBytes(cBytes);

            const kBytes = data.secretKey.split("").map((c: string) => toAsciiBinArray(c));
            setKeyBytes(kBytes);

            setUserBits(cBytes.map(() => [0, 0, 0, 0, 0, 0, 0, 0]));
          }

          const elapsed = Math.floor((Date.now() - data.startTime) / 1000);
          const remain = Math.max(0, data.timeLimit - elapsed);
          setTimeLeft(remain);

          if (remain === 0 && data.status === "PLAYING") {
            triggerExplode();
          }
        }
      } catch (err) {
        console.error("Poll error", err);
      }
    };

    fetchRoom();
    pollInterval.current = setInterval(fetchRoom, 1000);
    return () => clearInterval(pollInterval.current);
  }, [roomId, role, cipherBytes.length]);

  // ผู้ตั้งรหัสกดเริ่มจับเวลา
  const handleArmBomb = async () => {
    if (!defuserJoined) return alert("รอให้ผู้กู้ระเบิดเข้าห้องก่อนครับ");

    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ARM",
        roomId,
        data: {
          targetWord,
          secretKey,
          cipherHex,
          timeLimit,
        },
      }),
    });
  };

  // แตะสลับบิต (0 ⇄ 1)
  const toggleBit = (bitIndex: number) => {
    if (gameStatus !== "PLAYING") return;
    setUserBits((prev) => {
      const next = prev.map((arr) => [...arr]);
      next[activeCharIndex][bitIndex] = next[activeCharIndex][bitIndex] === 0 ? 1 : 0;
      return next;
    });
  };

  // กดยืนยันตัดวงจร
  const handleExecuteDefuse = async () => {
    if (gameStatus !== "PLAYING") return;
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SUBMIT",
        roomId,
        data: { answer: currentDecodedWord },
      }),
    });
  };

  const triggerExplode = async () => {
    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "EXPLODE", roomId }),
    });
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // =========================================================================
  // 1. หน้าจอ MENU: ปุ่มใหญ่ สีสด ชัดเจน (Mobile First)
  // =========================================================================
  if (role === "MENU") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-3">
        <div className="mobile-shell p-6 justify-between rounded-3xl border-4 border-slate-700 shadow-2xl">
          <div className="text-center my-4">
            <div className="inline-block bg-red-600 text-white font-black text-xs px-4 py-1 rounded-full uppercase tracking-widest mb-2 shadow-lg animate-pulse">
              WORKSHOP GAME
            </div>
            <h1 className="text-4xl font-black text-amber-400 tracking-wider">
              BOMB DEFUSE
            </h1>
            <p className="text-sm font-semibold text-slate-400 mt-1">
              ภารกิจถอดรหัสบิต XOR คู่หู
            </p>
          </div>

          <div className="space-y-6 my-auto">
            {/* โซนที่ 1: ผู้ตั้งรหัส */}
            <div className="bg-slate-800 border-3 border-amber-500 rounded-2xl p-5 shadow-lg">
              <span className="bg-amber-500 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-md uppercase">
                หน้าที่ 1
              </span>
              <h2 className="text-xl font-black text-white mt-2">ผู้ตั้งรหัสลับ</h2>
              <p className="text-xs text-slate-300 mt-1 mb-4">
                ตั้งคำภาษาอังกฤษและคีย์ เพื่อสร้างห้องเล่นกับเพื่อน
              </p>
              <button
                onClick={() => setRole("OPERATOR_SETUP")}
                className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-lg rounded-xl shadow-lg active:scale-95 transition"
              >
                + สร้างห้องใหม่
              </button>
            </div>

            {/* โซนที่ 2: ผู้กู้ระเบิด */}
            <div className="bg-slate-800 border-3 border-sky-500 rounded-2xl p-5 shadow-lg">
              <span className="bg-sky-500 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-md uppercase">
                หน้าที่ 2
              </span>
              <h2 className="text-xl font-black text-white mt-2">ผู้ปลดชนวน</h2>
              <p className="text-xs text-slate-300 mt-1 mb-3">
                กรอกรหัส 4 หลักที่ได้จากคู่หูเพื่อเริ่มกู้ระเบิด
              </p>
              <input
                type="text"
                maxLength={4}
                placeholder="รหัส 4 หลัก"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full h-14 bg-slate-950 text-sky-400 font-mono text-3xl font-black text-center rounded-xl border-2 border-slate-600 mb-3 tracking-widest focus:border-sky-400 outline-none uppercase"
              />
              <button
                onClick={handleJoinRoom}
                className="w-full h-14 bg-sky-600 hover:bg-sky-500 text-white font-black text-lg rounded-xl shadow-lg active:scale-95 transition"
              >
                จอยเข้าห้องทันที
              </button>
            </div>
          </div>

          <div className="text-center text-xs text-slate-500 font-semibold py-2">
            XOR BOMB DEFUSAL SYSTEM
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 2. หน้าจอตั้งค่ารหัสลับ (OPERATOR SETUP)
  // =========================================================================
  if (role === "OPERATOR_SETUP") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-3">
        <div className="mobile-shell p-6 justify-between rounded-3xl border-4 border-slate-700">
          <div className="flex justify-between items-center border-b border-slate-700 pb-3">
            <h2 className="text-2xl font-black text-amber-400">⚙️ ตั้งค่าคำลับ</h2>
            <button
              onClick={() => setRole("MENU")}
              className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-600"
            >
              ย้อนกลับ
            </button>
          </div>

          <div className="space-y-4 my-auto">
            <div>
              <label className="block text-sm font-bold text-slate-200 mb-1">
                1. คำศัพท์ลับที่ให้ทาย (3-4 ตัวอักษร):
              </label>
              <input
                type="text"
                maxLength={4}
                value={targetWord}
                onChange={(e) => setTargetWord(e.target.value.toUpperCase())}
                className="w-full h-14 bg-slate-950 border-2 border-slate-600 rounded-xl text-3xl font-mono text-center tracking-widest font-black text-emerald-400 outline-none focus:border-emerald-500 uppercase"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-1">
                2. กุญแจ Key (ยาวเท่าคำศัพท์):
              </label>
              <input
                type="text"
                maxLength={4}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                className="w-full h-14 bg-slate-950 border-2 border-slate-600 rounded-xl text-3xl font-mono text-center tracking-widest font-black text-sky-400 outline-none focus:border-sky-500 uppercase"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-1">
                3. เวลานับถอยหลัง:
              </label>
              <select
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="w-full h-14 bg-slate-950 border-2 border-slate-600 rounded-xl px-4 text-lg font-bold text-white outline-none"
              >
                <option value={60}>60 วินาที (1 นาที)</option>
                <option value={120}>120 วินาที (2 นาที)</option>
                <option value={180}>180 วินาที (3 นาที)</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSaveAndCreateRoom}
            disabled={isSubmitting}
            className="w-full h-16 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xl rounded-xl shadow-xl active:scale-95 transition"
          >
            {isSubmitting ? "กำลังสร้างห้อง..." : "✓ บันทึก และ สร้างห้อง"}
          </button>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 3. หน้าจอ LOBBY ฝั่งผู้ตั้งรหัส
  // =========================================================================
  if (role === "OPERATOR_LOBBY") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-3">
        <div className="mobile-shell p-6 justify-between rounded-3xl border-4 border-slate-700 text-center">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
              รหัสห้องสำหรับเพื่อน
            </span>
            <div className="text-6xl font-black font-mono tracking-widest text-amber-400 my-2 bg-slate-950 py-3 rounded-2xl border-2 border-amber-500/50">
              {roomId}
            </div>
          </div>

          <div className="my-auto">
            <div className={`p-4 rounded-xl text-sm font-bold border mb-4 ${
              defuserJoined 
                ? "bg-emerald-950 border-emerald-500 text-emerald-300" 
                : "bg-amber-950 border-amber-500 text-amber-300 animate-pulse"
            }`}>
              {defuserJoined ? "✓ คู่หูเชื่อมต่อเข้าสู่ห้องแล้ว!" : "⏳ กำลังรอคู่หูใส่รหัสห้องเข้ามา..."}
            </div>

            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-left space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">คำศัพท์ลับ:</span>
                <span className="text-emerald-400 font-bold font-mono text-lg">{targetWord}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Secret Key:</span>
                <span className="text-sky-400 font-bold font-mono text-lg">{secretKey}</span>
              </div>
            </div>
          </div>

          {gameStatus === "LOBBY" && (
            <button
              onClick={handleArmBomb}
              disabled={!defuserJoined}
              className={`w-full h-16 rounded-xl font-black text-xl tracking-wider uppercase transition shadow-lg ${
                defuserJoined
                  ? "bg-red-600 hover:bg-red-500 text-white active:scale-95 cursor-pointer shadow-red-600/50"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700"
              }`}
            >
              {defuserJoined ? "🚀 เริ่มนับเวลาถอยหลังทันที" : "รอคู่หูเข้าห้องก่อน"}
            </button>
          )}

          {gameStatus === "PLAYING" && (
            <div className="bg-slate-950 border-2 border-red-500 rounded-2xl p-4">
              <span className="text-xs text-red-400 font-bold block mb-1">DETONATION TIMER</span>
              <span className="text-5xl font-mono text-red-500 font-black tracking-widest">
                {formatTimer(timeLeft)}
              </span>
            </div>
          )}

          {gameStatus === "DEFUSED" && (
            <div className="p-4 bg-emerald-600 text-slate-950 font-black rounded-xl text-lg">
              ✓ อีกฝั่งกู้ระเบิดสำเร็จ!
            </div>
          )}

          {gameStatus === "EXPLODED" && (
            <div className="p-4 bg-red-600 text-white font-black rounded-xl text-lg animate-bounce">
              💥 ระเบิดทำงาน! อีกฝ่ายตอบผิดหรือหมดเวลา
            </div>
          )}
        </div>
      </main>
    );
  }

  // =========================================================================
  // 4. หน้าจอ DEFUSER : ลูกระเบิดไดนาไมต์สีแดงสดใสตามรูปตัวอย่าง
  // =========================================================================
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-2">
      <div className="mobile-shell p-3 sm:p-4 justify-between rounded-3xl border-4 border-slate-700">
        
        {/* หัวสถานะห้อง */}
        <div className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 mb-2">
          <div className="text-xs font-bold text-slate-300">
            ROOM: <span className="text-amber-400 font-mono text-base font-bold">{roomId}</span>
          </div>
          <button
            onClick={() => { setRoomId(""); setRole("MENU"); }}
            className="text-xs bg-slate-800 text-slate-200 px-2.5 py-1 rounded-lg border border-slate-600"
          >
            เมนูหลัก
          </button>
        </div>

        {gameStatus === "LOBBY" ? (
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-6 text-center my-auto">
            <div className="w-12 h-12 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <h2 className="text-xl font-black text-white mb-1">เชื่อมต่อแล้ว</h2>
            <p className="text-slate-400 text-xs">กำลังรอให้ผู้ตั้งรหัสกดยืนยันเริ่มจับเวลา...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 my-auto">
            
            {/* ก้อนแท่งไดนาไมต์สีแดงสดใส[cite: 12, 13] */}
            <div className="dynamite-bundle p-4 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="dynamite-strap top-2" />
              <div className="dynamite-strap bottom-2" />

              {/* จอนาฬิกา LED 7-Segment ดิจิทัล */}
              <div className="led-screen px-6 py-2 z-10 text-5xl font-black my-1">
                {formatTimer(timeLeft)}
              </div>

              <div className="z-10 text-[11px] font-black uppercase text-amber-300 tracking-wider">
                {gameStatus === "PLAYING" ? "⚡ BOMB ARMED" : gameStatus}
              </div>
            </div>

            {/* กล่องโมดูลแสดงค่า Cipher Hex & Secret Key */}
            <div className="circuit-module p-3">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">CIPHER (HEX)</div>
                  <div className="text-xl font-mono font-black text-amber-400">{cipherHex || "--"}</div>
                </div>
                <div className="bg-slate-900 border border-slate-700 rounded-lg p-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">GIVEN KEY</div>
                  <div className="text-xl font-mono font-black text-sky-400">{defuserKey || "----"}</div>
                </div>
              </div>
            </div>

            {/* แผงฝึก XOR Terminal: เลือกตัวอักษร และแตะสลับบิต */}
            <div className="circuit-module p-3 bg-slate-900">
              
              {/* แถบเลือกตัวอักษร */}
              <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-2">
                <div className="flex gap-1.5">
                  {userBits.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setActiveCharIndex(idx)}
                      className={`h-8 px-3 rounded-lg text-xs font-mono font-black transition ${
                        activeCharIndex === idx
                          ? "bg-sky-500 text-slate-950 shadow-[0_0_10px_#38bdf8]"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      ตัวที่ {idx + 1}
                    </button>
                  ))}
                </div>

                <div className="text-xs font-bold text-right">
                  คำที่ได้: <span className="text-xl font-mono text-emerald-400 font-black ml-1">{currentDecodedWord}</span>
                </div>
              </div>

              {/* แสดงบิตเปรียบเทียบระหว่าง Cipher กับ Key */}
              <div className="space-y-1.5 text-xs font-mono">
                <div className="bg-slate-950 px-2 py-1.5 rounded flex justify-between items-center border border-slate-800">
                  <span className="text-slate-400">Cipher บิต:</span>
                  <span className="text-amber-400 font-bold tracking-widest text-sm">
                    {cipherBytes[activeCharIndex]?.join("") || "00000000"}
                  </span>
                </div>

                <div className="text-center text-[10px] text-purple-400 font-bold">
                  ↓ XOR (เหมือนกันได้ 0, ต่างกันได้ 1) ↓
                </div>

                <div className="bg-slate-950 px-2 py-1.5 rounded flex justify-between items-center border border-slate-800">
                  <span className="text-slate-400">Key &apos;{defuserKey[activeCharIndex] || "?"}&apos; บิต:</span>
                  <span className="text-sky-400 font-bold tracking-widest text-sm">
                    {keyBytes[activeCharIndex]?.join("") || "00000000"}
                  </span>
                </div>
              </div>

              {/* ปุ่มบิต 8 ช่องขนาดใหญ่สำหรับนิ้วแตะบนมือถือ */}
              <div className="mt-3 text-center">
                <span className="text-xs font-bold text-amber-400 block mb-1.5 animate-pulse">
                  แตะที่บล็อกบิตด้านล่างเพื่อเปลี่ยน (0 ⇄ 1)
                </span>
                <div className="grid grid-cols-4 gap-2 justify-items-center">
                  {userBits[activeCharIndex]?.map((bit, bitIdx) => (
                    <button
                      key={bitIdx}
                      onClick={() => toggleBit(bitIdx)}
                      className={`mobile-bit-btn w-full ${bit === 1 ? "mobile-bit-1" : "mobile-bit-0"}`}
                    >
                      {bit}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* ปุ่มตัดวงจรปลดชนวนขนาดใหญ่ */}
            <button
              onClick={handleExecuteDefuse}
              disabled={gameStatus !== "PLAYING"}
              className={`w-full h-16 rounded-2xl font-black text-xl tracking-wider uppercase transition shadow-xl ${
                gameStatus === "PLAYING"
                  ? "bg-gradient-to-r from-red-600 via-orange-600 to-amber-500 hover:brightness-110 text-white cursor-pointer active:scale-95 shadow-red-600/40"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed"
              }`}
            >
              ✂️ ตัดวงจรระเบิด (DEFUSE)
            </button>

            {/* แจ้งผลชนะ/แพ้ */}
            {gameStatus === "DEFUSED" && (
              <div className="p-3 bg-emerald-500 text-slate-950 font-black text-center text-lg rounded-xl shadow-lg">
                ✓ BOMB DEFUSED! กู้ระเบิดสำเร็จ
              </div>
            )}
            {gameStatus === "EXPLODED" && (
              <div className="p-3 bg-red-600 text-white font-black text-center text-lg rounded-xl shadow-lg animate-bounce">
                💥 BOOM! ระเบิดทำงาน ถอดรหัสผิดหรือเวลาหมด!
              </div>
            )}

          </div>
        )}

        <div className="text-center text-[10px] text-slate-500 py-1">
          สูตร: 0⊕0=0, 0⊕1=1, 1⊕0=1, 1⊕1=0
        </div>
      </div>
    </main>
  );
}