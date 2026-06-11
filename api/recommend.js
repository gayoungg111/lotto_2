const MODEL = "gemini-2.5-flash-lite";

function getTodayKorean() {
  return new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function buildPrompt(birthDate, messages = []) {
  const today = getTodayKorean();
  const history = messages
    .map((m) => `${m.role === "user" ? "사용자" : "챗봇"}: ${m.content}`)
    .join("\n");

  return `당신은 한국 로또 6/45 번호 추천 챗봇입니다.
사용자의 생년월일과 오늘의 운세를 반영해 번호를 추천하고, 추천 이유를 친절하게 설명합니다.

[사용자 정보]
- 생년월일: ${birthDate}
- 오늘 날짜: ${today}

[대화 기록]
${history || "(첫 추천 요청)"}

[지침]
1. 1~45 사이에서 중복 없는 6개 번호와 보너스 번호 1개를 추천하세요.
2. fortune에는 오늘의 운세를 생년월일(띠, 별자리, 수비학 등)과 연결해 2~3문장으로 작성하세요.
3. explanation에는 각 번호 또는 번호 조합을 추천한 구체적 이유를 운세와 연결해 4~6문장으로 작성하세요.
4. 번호는 오름차순으로 정렬하세요. 보너스는 메인 6개와 겹치지 않아야 합니다.
5. 반드시 아래 JSON 형식만 출력하세요.`;
}

function validateResult(data) {
  if (!data || !Array.isArray(data.numbers) || typeof data.bonus !== "number") {
    return null;
  }

  const numbers = data.numbers.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 45);
  const bonus = Number(data.bonus);

  if (numbers.length !== 6 || new Set(numbers).size !== 6) return null;
  if (!Number.isInteger(bonus) || bonus < 1 || bonus > 45 || numbers.includes(bonus)) return null;

  numbers.sort((a, b) => a - b);

  return {
    numbers,
    bonus,
    fortune: String(data.fortune || "").trim(),
    explanation: String(data.explanation || "").trim(),
  };
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." });
  }

  const { birthDate, messages = [] } = req.body || {};

  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return res.status(400).json({ error: "생년월일(YYYY-MM-DD)을 입력해 주세요." });
  }

  const prompt = buildPrompt(birthDate, messages);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              numbers: {
                type: "ARRAY",
                items: { type: "INTEGER" },
              },
              bonus: { type: "INTEGER" },
              fortune: { type: "STRING" },
              explanation: { type: "STRING" },
            },
            required: ["numbers", "bonus", "fortune", "explanation"],
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return res.status(502).json({ error: "AI 응답 생성에 실패했습니다." });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: "AI 응답이 비어 있습니다." });
    }

    const parsed = JSON.parse(text);
    const result = validateResult(parsed);

    if (!result) {
      return res.status(502).json({ error: "추천 번호 형식이 올바르지 않습니다." });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error("Recommend API error:", error);
    return res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
}
