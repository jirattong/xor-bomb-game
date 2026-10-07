"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { rtdb } from "@/lib/firebase";
import { ref, set, update, onValue, off } from "firebase/database";

const SAFE_ROOM_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const generateSafeRoomId = (len = 4): string => {
  let res = "";
  for (let i = 0; i < len; i++) {
    res += SAFE_ROOM_CHARS.charAt(Math.floor(Math.random() * SAFE_ROOM_CHARS.length));
  }
  return res;
};

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

/** Visual-only skin */
function TacticalStyles() {
  return (
    <style jsx global>{`
      :root { color-scheme: dark; --tactical-bg: #070b0b; --tactical-panel: #0d1514; --tactical-line: #243532; --tactical-green: #b6ff55; --tactical-amber: #ffbf47; }
      html { background: var(--tactical-bg); }
      body { margin: 0; color: #e5eee9; background-color: var(--tactical-bg); background-image: radial-gradient(ellipse at 50% -10%, rgba(45, 91, 69, .24), transparent 55%), linear-gradient(rgba(111, 160, 139, .045) 1px, transparent 1px), linear-gradient(90deg, rgba(111, 160, 139, .045) 1px, transparent 1px); background-size: auto, 28px 28px, 28px 28px; }
      body::before { content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0; opacity: .12; background: repeating-linear-gradient(to bottom, transparent 0, transparent 3px, rgba(0,0,0,.55) 4px); }
      main { isolation: isolate; }
      .vault-panel { position: relative; overflow: hidden; border: 1px solid #344840 !important; border-radius: 24px !important; background: linear-gradient(145deg, rgba(17, 28, 25, .97), rgba(7, 12, 12, .98)) !important; box-shadow: 0 24px 80px rgba(0,0,0,.52), inset 0 1px rgba(220,255,238,.045), 0 0 0 5px rgba(21,37,31,.35) !important; }
      .vault-panel::before { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit; background: linear-gradient(115deg, rgba(182,255,85,.045), transparent 35%, transparent 70%, rgba(255,191,71,.035)); }
      .vault-module { position: relative; border: 1px solid #2d433b !important; border-radius: 16px !important; background: linear-gradient(145deg, rgba(17,29,26,.95), rgba(8,14,13,.96)) !important; box-shadow: inset 0 1px rgba(255,255,255,.035), 0 8px 22px rgba(0,0,0,.16); }
      .vault-module:focus-within { border-color: rgba(182,255,85,.62) !important; box-shadow: 0 0 0 3px rgba(182,255,85,.07), inset 0 1px rgba(255,255,255,.035); }
      .tactile-btn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: .5rem; border: 1px solid rgba(255,255,255,.18) !important; border-radius: 12px !important; font-weight: 900 !important; box-shadow: 0 4px 0 rgba(0,0,0,.42), 0 9px 20px rgba(0,0,0,.2), inset 0 1px rgba(255,255,255,.18); transition: transform .15s ease, filter .15s ease, box-shadow .15s ease; }
      .tactile-btn:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); }
      .tactile-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 rgba(0,0,0,.5), inset 0 2px 5px rgba(0,0,0,.22); }
      .tactile-btn:focus-visible, .tactile-bit-btn:focus-visible { outline: 3px solid var(--tactical-green); outline-offset: 3px; }
      
      /* Emergency Big Red Button */
      .emergency-red-btn {
        width: 110px;
        height: 110px;
        border-radius: 50% !important;
        background: radial-gradient(circle at 35% 35%, #ff4d4d, #b30000 65%, #660000 100%) !important;
        border: 4px solid #ff9999 !important;
        color: #ffffff !important;
        font-weight: 950 !important;
        font-size: 1.35rem !important;
        letter-spacing: 0.05em;
        box-shadow: 0 0 0 6px #241315, 0 12px 28px rgba(255, 0, 0, 0.45), inset 0 3px 6px rgba(255,255,255,0.7), inset 0 -5px 12px rgba(0,0,0,0.8) !important;
        transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.15s ease;
      }
      .emergency-red-btn:hover:not(:disabled) {
        filter: brightness(1.15);
        box-shadow: 0 0 0 6px #241315, 0 14px 34px rgba(255, 0, 0, 0.6), inset 0 3px 6px rgba(255,255,255,0.8), inset 0 -5px 12px rgba(0,0,0,0.8) !important;
      }
      .emergency-red-btn:active:not(:disabled) {
        transform: translateY(4px) scale(0.96);
        box-shadow: 0 0 0 6px #241315, 0 4px 12px rgba(255, 0, 0, 0.4), inset 0 4px 10px rgba(0,0,0,0.9) !important;
      }
      .emergency-red-btn:disabled {
        background: radial-gradient(circle at 50% 50%, #442a2b, #221415) !important;
        border-color: #553335 !important;
        color: #775557 !important;
        box-shadow: 0 0 0 5px #150d0e, inset 0 2px 4px rgba(0,0,0,0.8) !important;
        filter: none !important;
        cursor: not-allowed;
      }

      .tactile-bit-btn { min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border: 1px solid #354640; border-radius: 11px; font-weight: 950; transition: transform .12s ease, background .15s ease, box-shadow .15s ease, border-color .15s ease; touch-action: manipulation; user-select: none; }
      .tactile-bit-btn:active { transform: scale(.94); }
      .tactile-bit-1 { color: #071008 !important; background: linear-gradient(180deg, #d3ff87, #9be83b) !important; border-color: #d7ff9a !important; box-shadow: 0 0 18px rgba(182,255,85,.28), inset 0 1px rgba(255,255,255,.8), 0 3px 0 #426e1d !important; }
      .tactile-bit-0 { color: #71847b !important; background: linear-gradient(180deg, #17221e, #0a100e) !important; border-color: #2c3e36 !important; box-shadow: inset 0 2px 7px rgba(0,0,0,.55), 0 2px 0 #020403 !important; }
      .led-bulb-on { width: 8px; height: 8px; border-radius: 999px; background: #f5ffe9; box-shadow: 0 0 5px #fff, 0 0 12px #a7ff49; }
      .led-bulb-off { width: 8px; height: 8px; border-radius: 999px; background: #39473f; box-shadow: inset 0 1px 2px #000; }
      .vault-timer { color: #ffca67 !important; font-variant-numeric: tabular-nums; letter-spacing: .06em; text-shadow: 0 0 22px rgba(255,191,71,.22); }
      .hazard-stripe { border-radius: 5px; background: repeating-linear-gradient(135deg, #fbbf24 0 12px, #101614 12px 24px) !important; opacity: .92; }
      .brass-screw { z-index: 2; width: 8px; height: 8px; border-radius: 50%; background: linear-gradient(135deg,#d8c18b,#66512d) !important; box-shadow: inset 0 1px 1px rgba(255,255,255,.65), 0 1px 3px #000; }
      .brass-screw::after { content: ''; position: absolute; width: 5px; height: 1px; top: 3.5px; left: 1.5px; background: #45381f; transform: rotate(-35deg); }
      input, select { transition: border-color .15s ease, box-shadow .15s ease; }
      input:focus, select:focus { box-shadow: 0 0 0 3px rgba(182,255,85,.09), 0 0 22px rgba(182,255,85,.05) !important; }
      button:disabled { filter: saturate(.45); }
      @media (max-width: 640px) {
        .vault-panel { border-radius: 18px !important; }
        .vault-module { border-radius: 13px !important; }
        .tactile-btn { min-height: 52px; padding-left: .85rem; padding-right: .85rem; line-height: 1.2; }
        .tactile-bit-btn { min-height: 56px; border-radius: 8px; }
        .vault-panel .grid.grid-cols-8 { gap: 4px !important; }
        .vault-panel .grid.grid-cols-8 > * { min-width: 0; }
      }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; } }
    `}</style>
  );
}

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
  const [userBitsMatrix, setUserBitsMatrix] = useState<number[][]>([[0, 0, 0, 0, 0, 0, 0, 0]]);
  const [submittedWordResult, setSubmittedWordResult] = useState("");

  // บันทึกตำแหน่งที่เคยกดเข้าไปดูแล้ว
  const [visitedIndices, setVisitedIndices] = useState<number[]>([0]);

  const currentDecodedWord = useMemo(() => decodeBitsToWord(userBitsMatrix), [userBitsMatrix]);

  const triggerHaptic = (ms: number = 35) => {
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(ms);
    }
  };

  const handleResetToMenu = () => {
    triggerHaptic(30);
    setRole("MENU");
    setRoomId("");
    setInputRoomId("");
    setGameStatus("LOBBY");
    setDefuserJoined(false);
    setCipherBitsMatrix([]);
    setKeyBitsMatrix([]);
    setUserBitsMatrix([[0, 0, 0, 0, 0, 0, 0, 0]]);
    setActiveCharIndex(0);
    setVisitedIndices([0]);
    setSubmittedWordResult("");
    hasTriggeredExplodeRef.current = false;
    serverStartTimeRef.current = null;
  };

  // Firebase Realtime Listener
  useEffect(() => {
    if (!roomId || role === "MENU" || role === "OPERATOR_SETUP") return;

    const roomRef = ref(rtdb, `rooms/${roomId}`);

    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      setGameStatus(data.status);
      setDefuserJoined(Boolean(data.defuserJoined));

      if (data.targetWord) {
        preloadedTargetWordRef.current = data.targetWord;
        setTargetWord(data.targetWord);
      }
      if (data.secretKey) {
        setSecretKey(data.secretKey);
        setDefuserKey(data.secretKey);
      }
      if (data.cipherHex) {
        setCipherHex(data.cipherHex);
      }
      if (data.submittedWord) {
        setSubmittedWordResult(data.submittedWord);
      }

      if (data.status === "PLAYING") {
        if (data.startTime) {
          serverStartTimeRef.current = data.startTime;
          serverTimeLimitRef.current = data.timeLimit || 120;
        }

        if (data.cipherHex && cipherBitsMatrix.length === 0) {
          const hexStr = data.cipherHex;
          const cMatrix: number[][] = [];
          for (let i = 0; i < hexStr.length; i += 2) {
            const byteHex = hexStr.substr(i, 2);
            cMatrix.push(hexByteTo8Bits(byteHex));
          }
          setCipherBitsMatrix(cMatrix);
          const kMatrix = (data.secretKey || "").split("").map((c: string) => charTo8Bits(c));
          setKeyBitsMatrix(kMatrix);
          setUserBitsMatrix(cMatrix.map(() => [0, 0, 0, 0, 0, 0, 0, 0]));
        }
      }
    });

    return () => {
      off(roomRef);
    };
  }, [roomId, role, cipherBitsMatrix.length]);

  const triggerExplode = useCallback(async () => {
    if (hasTriggeredExplodeRef.current) return;
    hasTriggeredExplodeRef.current = true;
    setGameStatus("EXPLODED");
    triggerHaptic(200);

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    await update(roomRef, {
      status: "EXPLODED",
      submittedWord: decodeBitsToWord(userBitsMatrix) || "TIMEOUT",
    }).catch(() => {});
  }, [roomId, userBitsMatrix]);

  const handleSaveAndCreateRoom = async () => {
    const t = (targetWord || "CAT").trim().toUpperCase();
    const k = (secretKey || "BAT").trim().toUpperCase();

    if (!t || !k) return alert("กรุณากรอกทั้งคำศัพท์และ Key");
    if (t.length !== k.length) return alert("คำศัพท์และ Key ต้องมีความยาวเท่ากัน!");

    setIsSubmitting(true);
    const newId = generateSafeRoomId(4);

    let hex = "";
    for (let i = 0; i < t.length; i++) {
      const xorVal = t.charCodeAt(i) ^ k.charCodeAt(i);
      hex += xorVal.toString(16).padStart(2, "0").toUpperCase();
    }

    try {
      const roomRef = ref(rtdb, `rooms/${newId}`);
      await set(roomRef, {
        id: newId,
        status: "LOBBY",
        defuserJoined: false,
        targetWord: t,
        secretKey: k,
        cipherHex: hex,
        timeLimit: Number(timeLimit) || 120,
        startTime: null,
      });

      hasTriggeredExplodeRef.current = false;
      setRoomId(newId);
      setTargetWord(t);
      setSecretKey(k);
      setCipherHex(hex);
      setRole("OPERATOR_LOBBY");
    } catch (error) {
      console.error("Firebase create error:", error);
      alert("เกิดข้อผิดพลาดในการเชื่อมต่อ Firebase กรุณาตรวจสอบ Rules");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinRoom = async () => {
    const code = inputRoomId.replace(/[^A-Za-z0-9]/g, "").trim().toUpperCase();
    if (!code || code.length !== 4) return alert("กรุณาใส่รหัสห้อง 4 หลัก");

    try {
      const roomRef = ref(rtdb, `rooms/${code}`);
      await update(roomRef, { defuserJoined: true });

      hasTriggeredExplodeRef.current = false;
      setRoomId(code);
      setRole("DEFUSER");
    } catch (error) {
      console.error("Firebase join error:", error);
      alert("ไม่พบรหัสห้อง หรือเชื่อมต่อขัดข้อง");
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

  const handleArmBomb = async () => {
    if (!defuserJoined) return alert("รอให้ผู้กู้ระเบิดเข้าห้องก่อนครับ");

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    await update(roomRef, {
      status: "PLAYING",
      startTime: Date.now(),
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

  // ตรวจคำตอบและส่งผลลัพธ์
  const handleExecuteDefuse = async () => {
    if (gameStatus !== "PLAYING") return;

    // เช็คว่าดูครบทุกตำแหน่งแล้วหรือยัง
    if (visitedIndices.length < userBitsMatrix.length) {
      alert("⚠️ กรุณากดตรวจทานให้ครบทุกตำแหน่งก่อนยืนยัน!");
      return;
    }

    const finalAnswer = decodeBitsToWord(userBitsMatrix).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const expectedWord = preloadedTargetWordRef.current.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    setSubmittedWordResult(finalAnswer);

    const isCorrect = finalAnswer === expectedWord;
    const nextStatus = isCorrect ? "DEFUSED" : "EXPLODED";

    triggerHaptic(isCorrect ? 80 : 250);
    setGameStatus(nextStatus);

    const roomRef = ref(rtdb, `rooms/${roomId}`);
    await update(roomRef, {
      status: nextStatus,
      submittedWord: finalAnswer,
    }).catch(() => {});
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const timeUsedSeconds = Math.max(0, (serverTimeLimitRef.current || 120) - timeLeft);

  // =========================================================================
  // MODAL หน้าต่างสรุปผลการแข่งขัน
  // =========================================================================
  const renderResultModal = () => {
    if (gameStatus !== "DEFUSED" && gameStatus !== "EXPLODED") return null;

    const isWin = gameStatus === "DEFUSED";

    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div className={`vault-panel w-full max-w-lg p-6 sm:p-8 text-center border-4 shadow-2xl relative ${
          isWin ? "border-emerald-500 shadow-emerald-950/60" : "border-red-600 shadow-red-950/60"
        }`}>
          <div className="brass-screw absolute top-3 left-3" />
          <div className="brass-screw absolute top-3 right-3" />
          <div className="brass-screw absolute bottom-3 left-3" />
          <div className="brass-screw absolute bottom-3 right-3" />

          <div className={`inline-block p-4 rounded-full mb-3 ${isWin ? "bg-emerald-950/80 border-2 border-emerald-500" : "bg-red-950/80 border-2 border-red-500 animate-bounce"}`}>
            <span className="text-5xl">{isWin ? "🔓" : "💥"}</span>
          </div>

          <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full inline-block mb-2 ${
            isWin ? "bg-emerald-500 text-black" : "bg-red-600 text-white"
          }`}>
            {isWin ? "MISSION ACCOMPLISHED" : "DETONATION FAILURE"}
          </span>

          <h2 className={`text-3xl sm:text-4xl font-black mb-4 tracking-wider ${
            isWin ? "text-emerald-400" : "text-red-500"
          }`}>
            {isWin ? "ปลดชนวนสำเร็จ!" : "ระเบิดทำงาน!"}
          </h2>

          <div className="vault-module p-4 text-left space-y-2.5 text-sm sm:text-base mb-6 bg-black/80 border border-slate-700">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">คำศัพท์เป้าหมาย (Target):</span>
              <span className="text-emerald-400 font-mono font-black text-xl tracking-wider">{targetWord || preloadedTargetWordRef.current}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">กุญแจถอดรหัส (Secret Key):</span>
              <span className="text-sky-400 font-mono font-black text-xl tracking-wider">{secretKey || defuserKey}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span className="text-slate-400">คำตอบที่ส่ง (Answer):</span>
              <span className={`font-mono font-black text-xl tracking-wider ${isWin ? "text-emerald-400" : "text-rose-400"}`}>
                {submittedWordResult || currentDecodedWord || "---"}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1">
              <span className="text-slate-400">เวลาที่ใช้ไป:</span>
              <span className="text-amber-400 font-mono font-bold text-lg">{`${timeUsedSeconds} วินาที`}</span>
            </div>
          </div>

          <button
            onClick={handleResetToMenu}
            className={`tactile-btn w-full h-16 sm:h-18 text-xl font-black tracking-wider uppercase cursor-pointer ${
              isWin
                ? "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black"
                : "bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white"
            }`}
          >
            🔄 กลับสู่หน้าเมนูหลัก
          </button>
        </div>
      </div>
    );
  };

  // =========================================================================
  // 1. หน้าจอ MENU
  // =========================================================================
  if (role === "MENU") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <TacticalStyles />
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

  // =========================================================================
  // 2. หน้าจอ OPERATOR SETUP
  // =========================================================================
  if (role === "OPERATOR_SETUP") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <TacticalStyles />
        <div className="vault-panel w-full max-w-lg p-6 sm:p-10">
          <div className="brass-screw absolute top-4 left-4" />
          <div className="brass-screw absolute top-4 right-4" />
          <div className="brass-screw absolute bottom-4 left-4" />
          <div className="brass-screw absolute bottom-4 right-4" />

          <div className="flex justify-between items-center border-b-2 border-slate-700 pb-4 mb-6">
            <h2 className="text-2xl font-black text-amber-400">⚙️ ตั้งค่ารหัสตู้เซฟ</h2>
            <button
              onClick={() => setRole("MENU")}
              className="tactile-btn bg-slate-700 text-slate-200 text-xs px-4 py-2 cursor-pointer"
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
                onChange={(e) => setTargetWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
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
                onChange={(e) => setSecretKey(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
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
                className="w-full h-16 bg-black border-4 border-slate-700 rounded-2xl px-5 text-xl font-bold text-white outline-none cursor-pointer"
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

  // =========================================================================
  // 3. หน้าจอ OPERATOR LOBBY
  // =========================================================================
  if (role === "OPERATOR_LOBBY") {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 relative">
        <TacticalStyles />
        {renderResultModal()}

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
        </div>
      </main>
    );
  }

  // =========================================================================
  // 4. หน้าจอ DEFUSER
  // =========================================================================
  const totalChars = userBitsMatrix.length;
  const currentCipherBits = cipherBitsMatrix[activeCharIndex] || [0, 0, 0, 0, 0, 0, 0, 0];
  const currentKeyBits = keyBitsMatrix[activeCharIndex] || [0, 0, 0, 0, 0, 0, 0, 0];
  const currentUserBits = userBitsMatrix[activeCharIndex] || [0, 0, 0, 0, 0, 0, 0, 0];

  const hasVisitedAll = visitedIndices.length >= totalChars;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-6 relative">
      <TacticalStyles />
      {renderResultModal()}

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
            onClick={handleResetToMenu}
            className="tactile-btn bg-slate-800 text-slate-300 text-xs px-3 py-1.5 cursor-pointer"
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
              {/* แถบด้านบน: แสดงคำที่ถอดรหัสได้ */}
              <div className="flex justify-end items-center border-b border-slate-700 pb-3 mb-4">
                <div className="text-base font-bold flex items-center">
                  <span className="text-slate-300 text-xs sm:text-sm mr-2">คำที่ถอดรหัสได้:</span>
                  <div className="bg-black px-3 py-1 rounded-xl border border-slate-700 flex gap-1 font-mono text-2xl font-black shadow-inner">
                    {currentDecodedWord.split("").map((ch, idx) => (
                      <span
                        key={idx}
                        className={`px-1 rounded ${
                          idx === activeCharIndex
                            ? "text-emerald-300 bg-emerald-500/20 border-b-2 border-emerald-400 animate-pulse scale-110"
                            : "text-slate-400"
                        }`}
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* แผงแสดงบิต 8 หลัก */}
              <div className="space-y-4 bg-black/70 p-4 sm:p-6 rounded-2xl border-2 border-slate-800">
                {/* 1. แถว Cipher Bits */}
                <div>
                  <div className="text-xs font-bold text-amber-400 mb-1.5 flex justify-between">
                    <span>{`INPUT A (Cipher บิต ตัวที่ ${activeCharIndex + 1} จาก ${totalChars}):`}</span>
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

                {/* 2. แถว Key Bits */}
                <div>
                  <div className="text-xs font-bold text-sky-400 mb-1.5 flex justify-between">
                    <span>{`INPUT B (Key '${defuserKey[activeCharIndex] || "?"}' บิต ตัวที่ ${activeCharIndex + 1}):`}</span>
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

                <div className="text-center py-0.5">
                  <span className="text-xs font-bold text-emerald-400 animate-pulse">
                    {`↓ กำลังแก้ไขบิตตัวที่ ${activeCharIndex + 1} / ${totalChars} (0 ⇄ 1) ↓`}
                  </span>
                </div>

                {/* 3. แถวปุ่มแตะสลับบิต (Output) */}
                <div>
                  <div className="text-xs font-bold text-emerald-400 mb-2 flex justify-between items-center">
                    <span>{`OUTPUT บิตตัวที่ ${activeCharIndex + 1} (ได้ตัวอักษร: '${currentDecodedWord[activeCharIndex] || "?"}'):`}</span>
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

              {/* คำใบ้ XOR */}
              <div className="text-center pt-4 pb-2">
                <span className="bg-purple-900/80 border border-purple-500/60 text-purple-200 font-mono text-xs sm:text-sm font-bold px-5 py-1.5 rounded-full shadow-md inline-block">
                  💡 คำใบ้: XOR (เหมือนกันได้ 0, ต่างกันได้ 1)
                </span>
              </div>

              {/* 1. แถบเลือกตรวจทานตำแหน่ง (สีเขียวนีออนสำหรับตัวที่กำลังทำ) */}
              <div className="mt-3 pt-3 border-t border-slate-700/80 flex flex-col sm:flex-row items-center justify-between gap-3 bg-black/40 p-3 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">สลับตำแหน่งเพื่อตรวจทาน:</span>
                  <span className="bg-[#b6ff55] text-black text-xs font-black px-2.5 py-1 rounded-md uppercase tracking-wider shadow-[0_0_12px_#b6ff55]">
                    {`ตำแหน่งที่ ${activeCharIndex + 1} / ${totalChars}`}
                  </span>
                </div>

                <div className="flex gap-2">
                  {userBitsMatrix.map((_, idx) => {
                    const isActive = activeCharIndex === idx;
                    const isVisited = visitedIndices.includes(idx);

                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          triggerHaptic(20);
                          setActiveCharIndex(idx);
                          if (!visitedIndices.includes(idx)) {
                            setVisitedIndices((prev) => [...prev, idx]);
                          }
                        }}
                        className={`tactile-btn px-4 py-2 text-sm font-mono cursor-pointer flex items-center gap-1.5 transition-all duration-200 ${
                          isActive
                            ? "bg-[#b6ff55] !text-black !border-[#d9ff8d] shadow-[0_0_16px_#b6ff55] scale-105"
                            : isVisited
                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-600/60 hover:bg-emerald-900/80"
                            : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isActive ? "bg-black animate-ping" : isVisited ? "bg-emerald-400" : "bg-slate-500"}`} />
                        <span>{`ตัวที่ ${idx + 1}`}</span>
                        {isVisited && !isActive && <span className="text-[10px] text-emerald-400">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* แจ้งเตือนหากยังตรวจไม่ครบ */}
              {!hasVisitedAll && (
                <div className="text-center mt-2">
                  <span className="text-[11px] font-bold text-amber-400/90 animate-pulse">
                    ⚠️ กรุณากดดูและตรวจทานให้ครบทุกตำแหน่งก่อน ({visitedIndices.length}/{totalChars}) จึงจะปลดล็อกปุ่มยืนยัน
                  </span>
                </div>
              )}
            </div>

            {/* 2. ส่วนส่งคำตอบ: แยกออกมาด้านล่างอย่างชัดเจน + ปุ่มวงกลมสีแดงสไตล์ Detonator */}
            <div className="pt-6 pb-4 flex flex-col items-center justify-center">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                DETONATION / DEFUSE TRIGGER
              </span>

              <button
                onClick={handleExecuteDefuse}
                disabled={gameStatus !== "PLAYING" || !hasVisitedAll}
                className="emergency-red-btn flex flex-col items-center justify-center cursor-pointer"
                title={!hasVisitedAll ? "กรุณากดตรวจทานให้ครบทุกตัวก่อนส่ง" : "กดยืนยันเพื่อส่งคำตอบ"}
              >
                <span className="leading-tight">ยืนยัน</span>
              </button>

              <span className="text-[11px] font-bold text-slate-500 mt-3 text-center">
                {hasVisitedAll ? "แตะเพื่อตัดวงจรและส่งคำตอบ" : "ปุ่มถูกล็อกไว้จนกว่าจะตรวจทานครบทุกตำแหน่ง"}
              </span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}