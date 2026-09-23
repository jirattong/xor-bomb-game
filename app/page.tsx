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

  // แปลงบิตปัจจุบันเป็นตัวอักษร
  const currentDecodedWord = userBits
    .map((byte) => {
      const code = parseInt(byte.join(""), 2);
      return code >= 32 && code <= 126 ? String.fromCharCode(code) : "?";
    })
    .join("");

  // 1. ผู้ตั้งรหัสกดสร้างห้อง
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
  // 1. หน้าจอ MENU
  // =========================================================================
  if (role === "MENU") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-slate-900 border-4 border-slate-700 rounded-3xl p-6 sm:p-10 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-block bg-red-600 text-white font-black text-xs px-4 py-1 rounded-full uppercase tracking-widest mb-2 shadow-lg animate-pulse">
              WORKSHOP GAME
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-amber-400 tracking-wider">
              BOMB DEFUSE
            </h1>
            <p className="text-base font-semibold text-slate-400 mt-2">
              ภารกิจถอดรหัสบิต XOR สำหรับเวิร์กช็อป
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800 border-2 border-amber-500 rounded-2xl p-5 shadow-lg">
              <span className="bg-amber-500 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-md uppercase">
                ฝ่ายที่ 1
              </span>
              <h2 className="text-2xl font-black text-white mt-2">ผู้ตั้งรหัสลับ (Operator)</h2>
              <p className="text-sm text-slate-300 mt-1 mb-4">
                ตั้งคำศัพท์ภาษาอังกฤษและคีย์ เพื่อสร้างห้องเล่นกับเพื่อน
              </p>
              <button
                onClick={() => setRole("OPERATOR_SETUP")}
                className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black text-xl rounded-xl shadow-lg active:scale-95 transition"
              >
                + เข้าสู่หน้าตั้งค่า & สร้างห้อง
              </button>
            </div>

            <div className="bg-slate-800 border-2 border-sky-500 rounded-2xl p-5 shadow-lg">
              <span className="bg-sky-500 text-slate-950 font-black text-xs px-2.5 py-0.5 rounded-md uppercase">
                ฝ่ายที่ 2
              </span>
              <h2 className="text-2xl font-black text-white mt-2">ผู้ปลดชนวน (Defuser)</h2>
              <p className="text-sm text-slate-300 mt-1 mb-3">
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
                className="w-full h-14 bg-sky-600 hover:bg-sky-500 text-white font-black text-xl rounded-xl shadow-lg active:scale-95 transition"
              >
                จอยเข้าห้องทันที
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================================
  // 2. หน้าจอ OPERATOR SETUP
  // =========================================================================
  if (role === "OPERATOR_SETUP") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-slate-900 border-4 border-slate-700 rounded-3xl p-6 sm:p-10 shadow-2xl">
          <div className="flex justify-between items-center border-b border-slate-700 pb-3 mb-6">
            <h2 className="text-2xl font-black text-amber-400">⚙️ ตั้งค่าคำลับ</h2>
            <button
              onClick={() => setRole("MENU")}
              className="text-sm bg-slate-800 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-600"
            >
              ย้อนกลับ
            </button>
          </div>

          <div className="space-y-5 mb-8">
            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
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
              <label className="block text-sm font-bold text-slate-200 mb-2">
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
              <label className="block text-sm font-bold text-slate-200 mb-2">
                3. เวลานับถอยหลัง:
              </label>
              <select
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="w-full h-14 bg-slate-950 border-2 border-slate-600 rounded-xl px-4 text-xl font-bold text-white outline-none"
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
  // 3. หน้าจอ OPERATOR LOBBY
  // =========================================================================
  if (role === "OPERATOR_LOBBY") {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-slate-900 border-4 border-slate-700 rounded-3xl p-6 sm:p-10 shadow-2xl text-center">
          <div>
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest block mb-1">
              รหัสห้องสำหรับเพื่อน
            </span>
            <div className="text-6xl font-black font-mono tracking-widest text-amber-400 my-4 bg-slate-950 py-4 rounded-2xl border-2 border-amber-500/50">
              {roomId}
            </div>
          </div>

          <div className="my-6">
            <div className={`p-4 rounded-xl text-base font-bold border mb-4 ${
              defuserJoined 
                ? "bg-emerald-950 border-emerald-500 text-emerald-300" 
                : "bg-amber-950 border-amber-500 text-amber-300 animate-pulse"
            }`}>
              {defuserJoined ? "✓ คู่หูเชื่อมต่อเข้าสู่ห้องแล้ว!" : "⏳ กำลังรอคู่หูใส่รหัสห้องเข้ามา..."}
            </div>

            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-left space-y-2 text-base">
              <div className="flex justify-between">
                <span className="text-slate-400">คำศัพท์ลับ:</span>
                <span className="text-emerald-400 font-bold font-mono text-xl">{targetWord}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Secret Key:</span>
                <span className="text-sky-400 font-bold font-mono text-xl">{secretKey}</span>
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
            <div className="bg-slate-950 border-2 border-red-500 rounded-2xl p-5">
              <span className="text-xs text-red-400 font-bold block mb-1">DETONATION TIMER</span>
              <span className="text-6xl font-mono text-red-500 font-black tracking-widest">
                {formatTimer(timeLeft)}
              </span>
            </div>
          )}

          {gameStatus === "DEFUSED" && (
            <div className="p-4 bg-emerald-600 text-slate-950 font-black rounded-xl text-xl mt-4">
              ✓ อีกฝั่งกู้ระเบิดสำเร็จ!
            </div>
          )}

          {gameStatus === "EXPLODED" && (
            <div className="p-4 bg-red-600 text-white font-black rounded-xl text-xl animate-bounce mt-4">
              💥 ระเบิดทำงาน! อีกฝ่ายตอบผิดหรือหมดเวลา
            </div>
          )}
        </div>
      </main>
    );
  }

  // =========================================================================
  // 4. หน้าจอ DEFUSER : เต็มจอ + คอลัมน์บิตทั้ง 3 แถวตรงกันเป๊ะๆ 8 บิต
  // =========================================================================
  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-2 sm:p-5">
      <div className="full-screen-shell p-4 sm:p-8 rounded-3xl border-4 border-slate-700 justify-between">
        
        {/* หัวสถานะห้อง */}
        <div className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 mb-3">
          <div className="text-sm font-bold text-slate-300">
            ROOM: <span className="text-amber-400 font-mono text-xl font-bold ml-1">{roomId}</span>
          </div>
          <button
            onClick={() => { setRoomId(""); setRole("MENU"); }}
            className="text-xs sm:text-sm bg-slate-800 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-600 hover:bg-slate-700"
          >
            เมนูหลัก
          </button>
        </div>

        {gameStatus === "LOBBY" ? (
          <div className="bg-slate-900 border-2 border-slate-700 rounded-2xl p-10 text-center my-auto">
            <div className="w-16 h-16 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-black text-white mb-2">เชื่อมต่อเคสระเบิดแล้ว</h2>
            <p className="text-slate-400 text-sm">กำลังรอให้ผู้ตั้งรหัสกดยืนยันเริ่มปล่อยสัญญาณและจับเวลา...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 my-auto w-full">
            
            {/* ก้อนแท่งไดนาไมต์สีแดง */}
            <div className="dynamite-bundle p-4 flex flex-col items-center justify-center relative overflow-hidden">
              <div className="dynamite-strap top-2" />
              <div className="dynamite-strap bottom-2" />

              <div className="led-screen px-8 py-2 z-10 text-5xl sm:text-6xl font-black my-1">
                {formatTimer(timeLeft)}
              </div>

              <div className="z-10 text-xs font-black uppercase text-amber-300 tracking-wider">
                {gameStatus === "PLAYING" ? "⚡ BOMB ARMED" : gameStatus}
              </div>
            </div>

            {/* กล่องค่า Cipher Hex & Secret Key */}
            <div className="circuit-module p-3 sm:p-4 bg-slate-900">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-xs font-bold text-slate-400 uppercase">CIPHER (HEX)</div>
                  <div className="text-2xl sm:text-3xl font-mono font-black text-amber-400 mt-1">
                    {cipherHex || "--"}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="text-xs font-bold text-slate-400 uppercase">GIVEN KEY</div>
                  <div className="text-2xl sm:text-3xl font-mono font-black text-sky-400 mt-1">
                    {defuserKey || "----"}
                  </div>
                </div>
              </div>
            </div>

            {/* =========================================================================
                แผงฝึก XOR Terminal: แถวบิตทั้ง 3 แถว (Cipher, Key, Output) วางพิกัดคอลัมน์ตรงกันเป๊ะๆ
                ========================================================================= */}
            <div className="circuit-module p-4 sm:p-6 bg-slate-900/90">
              
              {/* แถบเลือกตัวอักษร */}
              <div className="flex flex-wrap justify-between items-center border-b border-slate-700 pb-3 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-300">เลือกตัวอักษร:</span>
                  <div className="flex gap-1.5 sm:gap-2">
                    {userBits.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setActiveCharIndex(idx)}
                        className={`h-9 px-4 rounded-lg text-sm font-mono font-black transition ${
                          activeCharIndex === idx
                            ? "bg-sky-500 text-slate-950 shadow-[0_0_12px_#38bdf8]"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        ตัวที่ {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-sm sm:text-base font-bold text-right">
                  คำที่ถอดรหัสได้: <span className="text-2xl sm:text-3xl font-mono text-emerald-400 font-black ml-1">{currentDecodedWord}</span>
                </div>
              </div>

              {/* คอนเทนเนอร์ Grid 8 ช่องที่ล็อคขนาดคอลัมน์ให้ตรงกันเป๊ะทั้ง 3 แถว */}
              <div className="space-y-3 bg-slate-950 p-3 sm:p-5 rounded-2xl border border-slate-800">
                
                {/* 1. แถว Cipher บิต */}
                <div>
                  <div className="text-xs font-bold text-amber-400 mb-1.5 flex justify-between">
                    <span>INPUT A (Cipher บิต):</span>
                    <span className="text-slate-400 text-[11px]">8 BITS</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-3">
                    {(cipherBytes[activeCharIndex] || [0,0,0,0,0,0,0,0]).map((bit, i) => (
                      <div
                        key={i}
                        className="bit-display-cell h-10 sm:h-12 text-lg sm:text-2xl bg-slate-900 text-amber-400 border border-amber-500/40"
                      >
                        {bit}
                      </div>
                    ))}
                  </div>
                </div>

                {/* สัญลักษณ์โอเปอเรเตอร์ XOR */}
                <div className="text-center py-0.5">
                  <span className="bg-purple-900/60 border border-purple-500/50 text-purple-300 font-mono text-xs font-bold px-4 py-0.5 rounded-full">
                    ↓ XOR (เหมือนกันได้ 0, ต่างกันได้ 1) ↓
                  </span>
                </div>

                {/* 2. แถว Key บิต */}
                <div>
                  <div className="text-xs font-bold text-sky-400 mb-1.5 flex justify-between">
                    <span>INPUT B (Key &apos;{defuserKey[activeCharIndex] || "?"}&apos; บิต):</span>
                    <span className="text-slate-400 text-[11px]">8 BITS</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-3">
                    {(keyBytes[activeCharIndex] || [0,0,0,0,0,0,0,0]).map((bit, i) => (
                      <div
                        key={i}
                        className="bit-display-cell h-10 sm:h-12 text-lg sm:text-2xl bg-slate-900 text-sky-400 border border-sky-500/40"
                      >
                        {bit}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ลูกศรเชื่อมลงมายังปุ่มกด */}
                <div className="text-center py-0.5">
                  <span className="text-[11px] font-bold text-amber-400 animate-pulse">
                    ↓ แตะปุ่มด้านล่างเพื่อเปลี่ยนค่า OUTPUT (0 ⇄ 1) ให้ตรงกับผล XOR ↓
                  </span>
                </div>

                {/* 3. แถวปุ่มแตะสลับบิต (Output) วาง 8 ช่องตรงกับ 2 แถวด้านบน */}
                <div>
                  <div className="text-xs font-bold text-emerald-400 mb-1.5 flex justify-between">
                    <span>OUTPUT (ผลลัพธ์ถอดรหัส):</span>
                    <span className="text-slate-400 text-[11px]">แตะเพื่อสลับ</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-3">
                    {userBits[activeCharIndex]?.map((bit, bitIdx) => (
                      <button
                        key={bitIdx}
                        onClick={() => toggleBit(bitIdx)}
                        className={`bit-touch-btn h-14 sm:h-20 text-2xl sm:text-3xl ${
                          bit === 1 ? "bit-touch-1" : "bit-touch-0"
                        }`}
                      >
                        {bit}
                      </button>
                    ))}
                  </div>
                </div>

              </div>

            </div>

            {/* ปุ่มตัดวงจรปลดชนวน */}
            <button
              onClick={handleExecuteDefuse}
              disabled={gameStatus !== "PLAYING"}
              className={`w-full h-16 sm:h-20 rounded-2xl font-black text-xl sm:text-2xl tracking-wider uppercase transition shadow-xl ${
                gameStatus === "PLAYING"
                  ? "bg-gradient-to-r from-red-600 via-orange-600 to-amber-500 hover:brightness-110 text-white cursor-pointer active:scale-95 shadow-red-600/40"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed"
              }`}
            >
              ✂️ ตัดวงจรระเบิด (DEFUSE)
            </button>

            {/* แจ้งผลชนะ/แพ้ */}
            {gameStatus === "DEFUSED" && (
              <div className="p-4 bg-emerald-500 text-slate-950 font-black text-center text-xl rounded-xl shadow-lg">
                ✓ BOMB DEFUSED! กู้ระเบิดสำเร็จ
              </div>
            )}
            {gameStatus === "EXPLODED" && (
              <div className="p-4 bg-red-600 text-white font-black text-center text-xl rounded-xl shadow-lg animate-bounce">
                💥 BOOM! ระเบิดทำงาน ถอดรหัสผิดหรือเวลาหมด!
              </div>
            )}

          </div>
        )}

        <div className="text-center text-xs text-slate-500 py-2">
          ตารางความจริง XOR: 0 ⊕ 0 = 0 | 0 ⊕ 1 = 1 | 1 ⊕ 0 = 1 | 1 ⊕ 1 = 0
        </div>
      </div>
    </main>
  );
}