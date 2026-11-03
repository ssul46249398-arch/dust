// 인증키를 보호하며 에어코리아 측정정보를 전달하는 Vercel 서버리스 함수입니다.
const API_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty";
const REGIONS = new Set([
  "전국", "서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
  "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"
]);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ message: "GET 요청만 사용할 수 있습니다." });
  }

  const key = process.env.AIRKOREA_KEY;
  if (!key) {
    return res.status(500).json({ message: "서버에 AIRKOREA_KEY 환경변수를 설정해주세요." });
  }

  const sido = typeof req.query.sido === "string" ? req.query.sido : "서울";
  if (!REGIONS.has(sido)) {
    return res.status(400).json({ message: "올바른 시도 이름을 선택해주세요." });
  }

  const url = `${API_URL}?serviceKey=${encodeURIComponent(key)}`
    + `&sidoName=${encodeURIComponent(sido)}`
    + "&returnType=json&numOfRows=100&pageNo=1&ver=1.3";

  let upstream;
  try {
    upstream = await fetch(url, {
      signal: AbortSignal.timeout(12000)
    });
  } catch {
    return res.status(502).json({ message: "에어코리아에 연결하지 못했습니다. 잠시 후 다시 시도해주세요." });
  }

  if (!upstream.ok) {
    return res.status(502).json({ message: "에어코리아 서버에서 오류가 발생했습니다." });
  }

  let text;
  try {
    text = await upstream.text();
  } catch {
    return res.status(502).json({ message: "에어코리아 응답을 읽지 못했습니다. 잠시 후 다시 시도해주세요." });
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return res.status(502).json({ message: "인증키 또는 요청값을 확인해주세요." });
  }

  const apiResponse = data.response;
  if (apiResponse?.header?.resultCode !== "00") {
    return res.status(502).json({ message: "인증키 또는 요청값을 확인해주세요." });
  }

  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  return res.status(200).json(data);
};
