function getSupabaseConfig() {
  const url = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SERVICE_ROLE_KEY ||
    "";

  const missing = [];
  if (!url) missing.push("SUPABASE_URL");
  if (!key) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  return { url, key, missing };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST 요청만 지원합니다." });
  }

  const { url: supabaseUrl, key: supabaseKey, missing } = getSupabaseConfig();

  if (missing.length > 0) {
    return res.status(500).json({
      error: `Supabase 환경변수가 없습니다: ${missing.join(", ")}. Vercel Settings → Environment Variables에서 이름을 정확히 입력하고 Redeploy 해주세요.`,
    });
  }

  const { name, phone, email } = req.body || {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return res.status(400).json({ error: "이름을 2자 이상 입력해 주세요." });
  }

  const phoneDigits = String(phone || "").replace(/\D/g, "");
  if (!/^01[016789]\d{7,8}$/.test(phoneDigits)) {
    return res.status(400).json({ error: "올바른 전화번호를 입력해 주세요." });
  }

  const emailTrimmed = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    return res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
  }

  const formattedPhone =
    phoneDigits.length === 11
      ? `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 7)}-${phoneDigits.slice(7)}`
      : `${phoneDigits.slice(0, 3)}-${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`;

  const payload = {
    name: name.trim(),
    phone: formattedPhone,
    email: emailTrimmed,
  };

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 409) {
      return res.status(409).json({ error: "이미 가입된 이메일입니다." });
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("Supabase insert error:", errText);
      return res.status(502).json({ error: "회원 정보 저장에 실패했습니다." });
    }

    return res.status(201).json({ success: true, message: "가입이 완료되었습니다." });
  } catch (error) {
    console.error("Signup API error:", error);
    return res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};
