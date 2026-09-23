"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

const charTo8Bits = (char: string): number[] => {
  if (!char) return [0, 0, 0, 0, 0, 0, 0, 0];
  return char.charCodeAt(0).toString(2).padStart(8, "0").split("").map(Number);
};

const hexByteTo8Bits = (hexByte: string): number[] => {
  const val = parseInt(hexByte, 16);
  if (isNaN(val)) return [0, 0, 0, 0, 0, 0, 0, 0];
  return val.toString(2).padStart(8, "0").split("").map(Number);
};

const decodeBitsToWord = (matrix: number[][]): string => {
  return matrix
    .map((byteArr) => {
      const code = parseInt(byteArr.join(""), 2);
      return code >= 32 && code <= 126 ? String.fromCharCode(code) : "?";
    })
    .join("");
};

export default function BombWorkshopGame() {
  const [role, setRole] = useState<"MENU" | "OPERATOR_SETUP" | "OPERATOR_LOBBY" | "DEFUSER">("MENU");
  const [roomId, setRoomId] = useState("");
  const [inputRoomId, setInputRoomId] = useState("");

  const [targetWord, setTargetWord] = useState("CAT");
  const [secretKey, setSecretKey] = useState("BAT");
  const [timeLimit, setTimeLimit] = useState(120);
  const [timeLeft, setTimeLeft] = useState(120);
  const [gameStatus, setGameStatus] = useState<"LOBBY" | "PLAYING" | "DEFUSED" | "EXPLODED">("LOBBY");
  const [defuserJoined, setDefuserJoined] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const serverStartTimeRef = useRef<number | null>(null);
  const serverTimeLimitRef = useRef<number>(120);
  const preloadedTargetWordRef = useRef<string>("");
  const hasTriggeredExplodeRef = useRef<boolean>(false);

  const [defuserKey, setDefuserKey] = useState("");
  const [cipherHex, setCipherHex] = useState("");
  const [cipherBitsMatrix, setCipherBitsMatrix] = useState<number[][]>([]);
  const [keyBitsMatrix, setKeyBitsMatrix] = useState<number[][]>([]);
  
  const [activeCharIndex, setActiveCharIndex] = useState(0);
  const [userBitsMatrix, setUserBitsMatrix] = useState<number[][]>([[0,0,0,0,0,0,0,0]]);
  const [submittedWordResult, setSubmittedWordResult] = useState("");

  const currentDecodedWord = useMemo(() => decodeBitsToWord(userBitsMatrix), [userBitsMatrix]);

  const triggerHaptic = (ms: number = 35) => {
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(ms);
    }
  };

  const triggerExplode = useCallback(async () => {
    if (hasTriggeredExplodeRef.current) return;
    hasTriggeredExplodeRef.current = true;
    setGameStatus("EXPLODED");
    triggerHaptic(200);

    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "EXPLODE", roomId }),
    }).catch(() => {});
  }, [roomId]);

  const handleSaveAndCreateRoom = async () => {
    const t = (targetWord || "CAT").trim().toUpperCase();
    const k = (secretKey || "BAT").trim().toUpperCase();

    if (!t || !k) return alert("กรุณากรอกทั้งคำศัพท์และ Key");
    if (t.length !== k.length) return alert("คำศัพท์และ Key ต้องมีความยาวเท่ากัน!");

    setIsSubmitting(true);
    const newId = Math.random().toString(36).substring(2, 6).toUpperCase();

    let hex = "";
    for (let i = 0; i < t.length; i++) {
      const xorVal = t.charCodeAt(i) ^ k.charCodeAt(i);
      hex += xorVal.toString(16).padStart(2, "0").toUpperCase();
    }

    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          action: "CREATE", 
          roomId: newId,
          data: {
            targetWord: t,
            secretKey: k,
            cipherHex: hex,
            timeLimit: Number(timeLimit) || 120
          }
        }),
      });

      if (res.ok) {
        hasTriggeredExplodeRef.current = false;
        setRoomId(newId);
        setTargetWord(t);
        setSecretKey(k);
        setCipherHex(hex);
        setRole("OPERATOR_LOBBY");
      } else {
        alert("ไม่สามารถสร้างห้องได้ กรุณาลองใหม่อีกครั้ง");
      }
    } catch {
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinRoom = async () => {
    const code = inputRoomId.replace(/[^A-Za-z0-9]/g, "").trim().toUpperCase();
    if (!code || code.length !== 4) return alert("กรุณาใส่รหัสห้อง 4 หลัก");

    try {
      const res = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "JOIN", roomId: code }),
      });

      if (res.ok) {
        hasTriggeredExplodeRef.current = false;
        setRoomId(code);
        setRole("DEFUSER");
      } else {
        alert("ไม่พบรหัสห้องนี้ กรุณาตรวจสอบอีกครั้ง");
      }
    } catch {
      alert("เชื่อมต่อเซิร์ฟเวอร์ขัดข้อง");
    }
  };

  useEffect(() => {
    if (gameStatus !== "PLAYING") return;
    const timer = setInterval(() => {
      if (serverStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - serverStartTimeRef.current) / 1000);
        const remain = Math.max(0, serverTimeLimitRef.current - elapsed);
        setTimeLeft(remain);
        if (remain === 0) triggerExplode();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [gameStatus, triggerExplode]);

  useEffect(() => {
    if (!roomId || role === "MENU" || role === "OPERATOR_SETUP") return;
    if (gameStatus === "DEFUSED" || gameStatus === "EXPLODED") return;

    let isMounted = true;
    let timeoutId: any = null;

    const pollRoom = async () => {
      try {
        const res = await fetch(`/api/room?roomId=${roomId}&_t=${Date.now()}`, {
          cache: "no-store",
        });

        if (res.ok && isMounted) {
          const data = await res.json();
          setGameStatus(data.status);
          setDefuserJoined(Boolean(data.defuserJoined));

          if (data.status === "PLAYING") {
            setDefuserKey(data.secretKey);
            setCipherHex(data.cipherHex);

            if (data.targetWord) preloadedTargetWordRef.current = data.targetWord;
            if (data.startTime) {
              serverStartTimeRef.current = data.startTime;
              serverTimeLimitRef.current = data.timeLimit;
            }

            if (data.cipherHex && cipherBitsMatrix.length === 0) {
              const hexStr = data.cipherHex;
              const cMatrix: number[][] = [];
              for (let i = 0; i < hexStr.length; i += 2) {
                const byteHex = hexStr.substr(i, 2);
                cMatrix.push(hexByteTo8Bits(byteHex));
              }
              setCipherBitsMatrix(cMatrix);
              const kMatrix = data.secretKey.split("").map((c: string) => charTo8Bits(c));
              setKeyBitsMatrix(kMatrix);
              setUserBitsMatrix(cMatrix.map(() => [0, 0, 0, 0, 0, 0, 0, 0]));
            }
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
      } finally {
        if (isMounted) {
          timeoutId = setTimeout(pollRoom, 1000);
        }
      }
    };

    pollRoom();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [roomId, role, gameStatus, cipherBitsMatrix.length]);

  const handleArmBomb = async () => {
    if (!defuserJoined) return alert("รอให้ผู้กู้ระเบิดเข้าห้องก่อนครับ");

    await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ARM",
        roomId,
        data: { targetWord, secretKey, cipherHex, timeLimit },
      }),
    });
  };

  const toggleBit = (bitIndex: number) => {
    if (gameStatus !== "PLAYING") return;
    triggerHaptic(25);
    setUserBitsMatrix((prev) => {
      const next = prev.map((row) => [...row]);
      next[activeCharIndex][bitIndex] = next[activeCharIndex][bitIndex] === 0 ? 1 : 0;
      return next;
    });
  };

  const handleExecuteDefuse = () => {
    if (gameStatus !== "PLAYING") return;

    const finalAnswer = decodeBitsToWord(userBitsMatrix).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const expectedWord = preloadedTargetWordRef.current.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    setSubmittedWordResult(finalAnswer);

    const isCorrect = finalAnswer === expectedWord;
    const nextStatus = isCorrect ? "DEFUSED" : "EXPLODED";

    triggerHaptic(isCorrect ? 80 : 250);
    setGameStatus(nextStatus);

    fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "SET_STATUS",
        roomId,
        data: { status: nextStatus },
      }),
    }).catch((e) => console.error("Sync status error", e));
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (role === "MENU") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="vault-panel w-full max-w-xl p-6 sm:p-10">
          <div className="brass-screw absolute top-4 left-4" />
          <div className="brass-screw absolute top-4 right-4" />
          <div className="brass-screw absolute bottom-4 left-4" />
          <div className="brass-screw absolute bottom-4 right-4" />
          <div className="hazard-stripe h-4 w-full mb-6" />

          <div className="text-center mb-8">
            <span className="bg-amber-500 text-black font-black text-xs px-4 py-1 rounded-full uppercase tracking-widest shadow-md">
              INDUSTRIAL VAULT PROTOCOL
            </span>
            <h1 className="text-4xl sm:text-5xl font-black text-white tracking-wider mt-3">
              XOR BOMB LOCK
            </h1>
            <p className="text-sm font-semibold text-slate-400 mt-1">
              ระบบถอดรหัสปลดล็อกตู้เซฟกลไกความปลอดภัย
            </p>
          </div>

          <div className="space-y-6">
            <div className="vault-module p-6 border-amber-500/40">
              <span className="text-xs font-black text-amber-400 uppercase tracking-widest block mb-1">
                MODULE 01
              </span>
              <h2 className="text-2xl font-black text-white mb-2">ผู้ตั้งรหัสลับ (Operator)</h2>
              <p className="text-xs text-slate-300 mb-5">
                กำหนดคำศัพท์และคีย์ เพื่อเปิดสัญญาณตู้เซฟให้คู่หู
              </p>
              <button
                onClick={() => setRole("OPERATOR_SETUP")}
                className="tactile-btn w-full h-16 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black text-xl tracking-wider cursor-pointer"
              >
                + ตั้งค่า & เปิดห้องใหม่
              </button>
            </div>

            <div className="vault-module p-6 border-sky-500/40">
              <span className="text-xs font-black text-sky-400 uppercase tracking-widest block mb-1">
                MODULE 02
              </span>
              <h2 className="text-2xl font-black text-white mb-2">ผู้ปลดล็อก (Defuser)</h2>
              <p className="text-xs text-slate-300 mb-4">
                กรอกรหัส 4 หลักที่ได้จากคู่หูเพื่อเข้าสู่แผงควบคุม
              </p>
              <input
                type="text"
                maxLength={4}
                placeholder="ใส่รหัสห้อง 4 หลัก"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                className="w-full h-16 bg-black text-sky-400 font-mono text-3xl font-black text-center rounded-2xl border-4 border-slate-700 mb-4 tracking-widest focus:border-sky-400 outline-none uppercase shadow-inner"
              />
              <button
                onClick={handleJoinRoom}
                className="tactile-btn w-full h-16 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white text-xl tracking-wider cursor-pointer"
              >
                เชื่อมต่อเข้าสู่ตู้เซฟ
              </button>
            </div>
          </div>
          <div className="hazard-stripe h-4 w-full mt-6" />
        </div>
      </main>
    );
  }

  if (role === "OPERATOR_SETUP") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="vault-panel w-full max-w-lg p-6 sm:p-10">
          <div className="brass-screw absolute top-4 left-4" />
          <div className="brass-screw absolute top-4 right-4" />
          <div className="brass-screw absolute bottom-4 left-4" />
          <div className="brass-screw absolute bottom-4 right-4" />

          <div className="flex justify-between items-center border-b-2 border-slate-700 pb-4 mb-6">
            <h2 className="text-2xl font-black text-amber-400">⚙️ ตั้งค่ารหัสตู้เซฟ</h2>
            <button
              onClick={() => setRole("MENU")}
              className="tactile-btn bg-slate-700 text-slate-200 text-xs px-4 py-2"
            >
              ย้อนกลับ
            </button>
          </div>

          <div className="space-y-5 mb-8">
            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                1. คำศัพท์ลับที่ต้องการให้ถอดรหัส (3-4 ตัวอักษร):
              </label>
              <input
                type="text"
                maxLength={4}
                value={targetWord}
                onChange={(e) => setTargetWord(e.target.value.toUpperCase())}
                className="w-full h-16 bg-black border-4 border-slate-700 rounded-2xl text-3xl font-mono text-center tracking-widest font-black text-emerald-400 outline-none focus:border-emerald-500 uppercase shadow-inner"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                2. กุญแจ Key (ความยาวเท่ากับคำศัพท์):
              </label>
              <input
                type="text"
                maxLength={4}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value.toUpperCase())}
                className="w-full h-16 bg-black border-4 border-slate-700 rounded-2xl text-3xl font-mono text-center tracking-widest font-black text-sky-400 outline-none focus:border-sky-500 uppercase shadow-inner"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-200 mb-2">
                3. เวลาที่ให้กู้ระเบิด:
              </label>
              <select
                value={timeLimit}
                onChange={(e) => setTimeLimit(Number(e.target.value))}
                className="w-full h-16 bg-black border-4 border-slate-700 rounded-2xl px-5 text-xl font-bold text-white outline-none"
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
            className="tactile-btn w-full h-18 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black text-xl tracking-wider cursor-pointer"
          >
            {isSubmitting ? "กำลังเปิดสัญญาณ..." : "✓ บันทึกรหัส & สร้างตู้เซฟ"}
          </button>
        </div>
      </main>
    );
  }

  if (role === "OPERATOR_LOBBY") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="vault-panel w-full max-w-lg p-6 sm:p-10 text-center">
          <div className="brass-screw absolute top-4 left-4" />
          <div className="brass-screw absolute top-4 right-4" />
          <div className="brass-screw absolute bottom-4 left-4" />
          <div className="brass-screw absolute bottom-4 right-4" />

          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-2">
            รหัสตู้เซฟสำหรับคู่หู
          </span>
          <div className="text-6xl font-black font-mono tracking-widest text-amber-400 my-4 bg-black py-4 rounded-2xl border-4 border-amber-500/50 shadow-inner">
            {roomId}
          </div>

          <div className={`p-4 rounded-xl text-base font-bold border-2 mb-6 ${
            defuserJoined 
              ? "bg-emerald-950/80 border-emerald-500 text-emerald-300" 
              : "bg-amber-950/80 border-amber-500 text-amber-300 animate-pulse"
          }`}>
            {defuserJoined ? "✓ คู่หูเชื่อมต่อเข้าสู่ตู้เซฟแล้ว!" : "⏳ กำลังรอคู่หูใส่รหัสห้องเข้ามา..."}
          </div>

          <div className="vault-module p-4 text-left space-y-2 text-base mb-6">
            <div className="flex justify-between">
              <span className="text-slate-400">คำศัพท์ลับ:</span>
              <span className="text-emerald-400 font-bold font-mono text-xl">{targetWord}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Secret Key:</span>
              <span className="text-sky-400 font-bold font-mono text-xl">{secretKey}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Cipher (HEX):</span>
              <span className="text-amber-400 font-bold font-mono text-xl">{cipherHex}</span>
            </div>
          </div>

          {gameStatus === "LOBBY" && (
            <button
              onClick={handleArmBomb}
              disabled={!defuserJoined}
              className={`tactile-btn w-full h-18 text-xl tracking-wider uppercase cursor-pointer ${
                defuserJoined
                  ? "bg-gradient-to-r from-red-600 to-rose-600 text-white"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed border-slate-700"
              }`}
            >
              {defuserJoined ? "🚀 เริ่มนับถอยหลังทันที" : "รอคู่หูเข้าห้องก่อน"}
            </button>
          )}

          {gameStatus === "PLAYING" && (
            <div className="vault-timer py-4 text-6xl font-black">
              {formatTimer(timeLeft)}
            </div>
          )}

          {gameStatus === "DEFUSED" && (
            <div className="p-4 bg-emerald-600 text-white font-black rounded-2xl text-xl mt-4 shadow-lg">
              ✓ อีกฝั่งปลดชนวนสำเร็จ!
            </div>
          )}

          {gameStatus === "EXPLODED" && (
            <div className="p-4 bg-red-600 text-white font-black rounded-2xl text-xl mt-4 animate-bounce shadow-lg">
              💥 ระเบิดทำงาน! อีกฝ่ายตอบผิดหรือหมดเวลา
            </div>
          )}
        </div>
      </main>
    );
  }

  const currentCipherBits = cipherBitsMatrix[activeCharIndex] || [0,0,0,0,0,0,0,0];
  const currentKeyBits = keyBitsMatrix[activeCharIndex] || [0,0,0,0,0,0,0,0];
  const currentUserBits = userBitsMatrix[activeCharIndex] || [0,0,0,0,0,0,0,0];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-6">
      <div className="vault-panel w-full max-w-5xl p-4 sm:p-8">
        <div className="brass-screw absolute top-3 left-3" />
        <div className="brass-screw absolute top-3 right-3" />
        <div className="brass-screw absolute bottom-3 left-3" />
        <div className="brass-screw absolute bottom-3 right-3" />

        <div className="flex justify-between items-center bg-black/60 border-2 border-slate-700 rounded-xl px-4 py-2.5 mb-4">
          <div className="text-sm font-bold text-slate-300">
            VAULT UNIT: <span className="text-amber-400 font-mono text-xl ml-2 font-black">{roomId}</span>
          </div>
          <button
            onClick={() => { setRoomId(""); setRole("MENU"); }}
            className="tactile-btn bg-slate-800 text-slate-300 text-xs px-3 py-1.5"
          >
            เมนูหลัก
          </button>
        </div>

        {gameStatus === "LOBBY" ? (
          <div className="vault-module p-12 text-center my-10">
            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-2xl font-black text-white mb-2">เชื่อมต่อระบบวงจรแล้ว</h2>
            <p className="text-slate-400 text-sm">กำลังรอให้ฝ่าย Operator กดยืนยันปล่อยสัญญาณและเริ่มจับเวลา...</p>
          </div>
        ) : (
          <div className="space-y-4">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="vault-module p-4 flex flex-col items-center justify-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                  DETONATION COUNTDOWN
                </span>
                <div className="vault-timer w-full py-2 text-center text-5xl sm:text-6xl font-black">
                  {formatTimer(timeLeft)}
                </div>
              </div>

              <div className="vault-module p-4 flex flex-col justify-center text-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  CIPHER SIGNAL (HEX)
                </span>
                <div className="text-3xl font-mono font-black text-amber-400 mt-1">
                  {cipherHex || "--"}
                </div>
              </div>

              <div className="vault-module p-4 flex flex-col justify-center text-center">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                  SECRET KEY
                </span>
                <div className="text-3xl font-mono font-black text-sky-400 mt-1">
                  {defuserKey || "----"}
                </div>
              </div>
            </div>

            <div className="vault-module p-4 sm:p-6 border-2 border-slate-600">
              <div className="flex flex-wrap justify-between items-center border-b border-slate-700 pb-3 mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold text-slate-300">เลือกตัวอักษร:</span>
                  <div className="flex gap-2">
                    {userBitsMatrix.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => { triggerHaptic(20); setActiveCharIndex(idx); }}
                        className={`tactile-btn px-4 py-2 text-sm font-mono cursor-pointer ${
                          activeCharIndex === idx
                            ? "bg-amber-500 text-black border-amber-300 shadow-[0_0_12px_#f59e0b]"
                            : "bg-slate-800 text-slate-300 border-slate-700"
                        }`}
                      >
                        ตัวที่ {idx + 1}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-base font-bold">
                  คำที่ถอดรหัสได้:{" "}
                  <span className="text-3xl font-mono text-emerald-400 font-black ml-2 bg-black px-3 py-1 rounded border border-emerald-500/50">
                    {currentDecodedWord}
                  </span>
                </div>
              </div>

              <div className="space-y-4 bg-black/70 p-4 sm:p-6 rounded-2xl border-2 border-slate-800">
                <div>
                  <div className="text-xs font-bold text-amber-400 mb-1.5 flex justify-between">
                    <span>{`INPUT A (Cipher บิต ตัวที่ ${activeCharIndex + 1}):`}</span>
                    <span className="text-slate-500 text-[11px]">8 BITS</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-3">
                    {currentCipherBits.map((bit, i) => (
                      <div
                        key={i}
                        className="h-12 sm:h-14 bg-slate-900 border-2 border-amber-500/40 rounded-xl flex items-center justify-center font-mono text-xl sm:text-2xl font-black text-amber-400 shadow-inner"
                      >
                        {bit}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-center py-0.5">
                  <span className="bg-purple-900/80 border border-purple-500/60 text-purple-200 font-mono text-xs font-bold px-4 py-1 rounded-full shadow-md">
                    ↓ XOR (เหมือนกันได้ 0, ต่างกันได้ 1) ↓
                  </span>
                </div>

                <div>
                  <div className="text-xs font-bold text-sky-400 mb-1.5 flex justify-between">
                    <span>{`INPUT B (Key '${defuserKey[activeCharIndex] || "?"}' บิต):`}</span>
                    <span className="text-slate-500 text-[11px]">8 BITS</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-3">
                    {currentKeyBits.map((bit, i) => (
                      <div
                        key={i}
                        className="h-12 sm:h-14 bg-slate-900 border-2 border-sky-500/40 rounded-xl flex items-center justify-center font-mono text-xl sm:text-2xl font-black text-sky-400 shadow-inner"
                      >
                        {bit}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-center py-1">
                  <span className="text-xs font-bold text-amber-400 animate-pulse">
                    ↓ แตะปุ่มสวิตช์ด้านล่างเพื่อเปลี่ยนค่า (0 ⇄ 1) ให้ตรงกับผล XOR ↓
                  </span>
                </div>

                <div>
                  <div className="text-xs font-bold text-emerald-400 mb-2 flex justify-between">
                    <span>{`OUTPUT บิตตัวที่ ${activeCharIndex + 1} (ได้ตัว: '${currentDecodedWord[activeCharIndex] || "?"}'):`}</span>
                    <span className="text-slate-400 text-[11px]">สวิตช์สัมผัส 3D</span>
                  </div>
                  <div className="grid grid-cols-8 gap-1.5 sm:gap-3">
                    {currentUserBits.map((bit, bitIdx) => (
                      <button
                        key={bitIdx}
                        onClick={() => toggleBit(bitIdx)}
                        className={`tactile-bit-btn h-16 sm:h-22 text-2xl sm:text-4xl cursor-pointer ${
                          bit === 1 ? "tactile-bit-1" : "tactile-bit-0"
                        }`}
                      >
                        <div className={`mb-1 ${bit === 1 ? "led-bulb-on" : "led-bulb-off"}`} />
                        <span>{bit}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            <button
              onClick={handleExecuteDefuse}
              disabled={gameStatus !== "PLAYING"}
              className={`tactile-btn w-full h-18 sm:h-22 text-xl sm:text-2xl tracking-widest uppercase cursor-pointer ${
                gameStatus === "PLAYING"
                  ? "bg-gradient-to-r from-red-600 via-orange-600 to-amber-500 text-white"
                  : "bg-slate-800 text-slate-600 cursor-not-allowed border-slate-700"
              }`}
            >
              ✂️ CUT CIRCUIT / UNLOCK VAULT (ส่งคำตอบถอดรหัส)
            </button>

            {gameStatus === "DEFUSED" && (
              <div className="p-4 bg-emerald-600 text-white font-black text-center text-xl rounded-xl shadow-xl">
                {`✓ BOMB DEFUSED! ปลดชนวนสำเร็จ คำตอบถูกต้อง ("${submittedWordResult}")`}
              </div>
            )}
            {gameStatus === "EXPLODED" && (
              <div className="p-4 bg-red-600 text-white font-black text-center text-xl rounded-xl shadow-xl animate-bounce">
                {`💥 BOOM! ระเบิดทำงาน คำตอบ ("${submittedWordResult || currentDecodedWord}") ไม่ถูกต้อง หรือหมดเวลา!`}
              </div>
            )}

          </div>
        )}

        <div className="text-center text-xs text-slate-400 py-3 mt-2">
          RULE: 0 ⊕ 0 = 0 | 0 ⊕ 1 = 1 | 1 ⊕ 0 = 1 | 1 ⊕ 1 = 0
        </div>
      </div>
    </main>
  );
}