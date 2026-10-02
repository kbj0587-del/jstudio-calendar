// lecture-cert-seeds.js — 자격증 발급 폼 시드(최초 1회 자동 등록)
//  ensureCertTables()에서 cert_types가 비어 있을 때만 삽입. 디자인 변경 시 이 파일 갱신.
const AROMA_TEMPLATE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>아로마 전문 지도사 자격증</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500&family=Open+Sans:wght@400;500;600&family=Oswald:wght@500;600&family=Nanum+Myeongjo:wght@700;800&family=Noto+Sans+KR:wght@400;500&family=Mrs+Saint+Delafield&display=swap">
<style>
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#ffffff}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;font-family:'Open Sans','Noto Sans KR',sans-serif;color:#26292c;margin:0 auto}
</style>
</head>
<body>
<div class="cert">
  <img src="https://mjs.ai.kr/cert-assets/aroma-cert-bg.jpg" alt="" style="position:absolute;left:0;top:0;width:794px;height:1123px;object-fit:fill">
  <div style="position:absolute;left:0;top:0;width:794px;height:1123px;background:#ffffff;opacity:0.5;pointer-events:none"></div>
  <img src="https://mjs.ai.kr/cert-assets/aroma-cert-frame.webp" alt="" style="position:absolute;left:0;top:0;width:794px;height:1123px;object-fit:fill;pointer-events:none">

  <div style="position:absolute;left:173px;top:158px;width:452px;display:flex;flex-direction:column;align-items:center;gap:8px">
    <div style="font-family:'Cinzel',serif;font-weight:400;font-size:42px;line-height:1.05;letter-spacing:1px;color:#CDB17A">CERTIFICATE</div>
    <div style="font-family:'Nanum Myeongjo',serif;font-weight:800;font-size:23px;line-height:1.25;letter-spacing:4px;margin-right:-4px;color:#CDB17A">아로마 전문 지도사</div>
    <div style="font-family:'Open Sans',sans-serif;font-weight:500;font-size:15px;line-height:1.3;letter-spacing:1px;color:#CDB17A">Professional Aroma Instructor</div>
  </div>

  <div style="position:absolute;left:119px;top:446px;width:560px;text-align:center;font-size:18px;font-weight:400;letter-spacing:0.3px;text-transform:uppercase;text-shadow:0 0 4px rgba(255,255,255,0.9)">This certificate is proudly presented to</div>

  <div style="position:absolute;left:119px;top:482px;width:560px;height:108px;display:flex;align-items:flex-end;justify-content:center">
    <div style="font-family:'Cinzel',serif;font-size:50px;line-height:1.15;color:#1c1f22;white-space:nowrap;text-shadow:0 0 6px rgba(255,255,255,0.9)">{{holder_name}}</div>
  </div>

  <div style="position:absolute;left:109px;top:638px;width:580px;text-align:center;font-size:16px;line-height:1.5;white-space:pre-line;word-break:keep-all;text-shadow:0 0 4px rgba(255,255,255,0.9);font-family:'Nanum Myeongjo',serif">In recognition of the successful completion of the Professional
Aroma Instructor Course at MJ Studio. The recipient has studied
the properties of essential oils, blending techniques and
holistic wellness care, and has demonstrated the knowledge
and practical skills required for the safe and effective
use of natural aromatics.</div>

  <div style="position:absolute;left:107px;top:1038px;width:580px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:24px;row-gap:4px;font-family:'Noto Sans KR',sans-serif;font-size:13px;line-height:1.6;color:#26292c;text-shadow:0 0 4px rgba(255,255,255,0.9)">
    <div style="text-align:left"><span style="color:#7a6538;font-weight:500;margin-right:8px">등급 Grade</span>기본 (Basic)</div>
    <div style="text-align:left"><span style="color:#7a6538;font-weight:500;margin-right:8px">등록번호 Reg. No.</span>2024-002070</div>
    <div style="text-align:left"><span style="color:#7a6538;font-weight:500;margin-right:8px">발급기관 Issued by</span>{{issuer}}</div>
    <div style="text-align:left"><span style="color:#7a6538;font-weight:500;margin-right:8px">발급번호 Issue No.</span>{{cert_no}}</div>
  </div>

  <div style="position:absolute;left:341px;top:878px;width:120px;height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#efe6d4">
    <svg width="42" height="18" viewBox="0 0 42 18" style="color:#efe6d4;display:block;margin-bottom:1px" aria-hidden="true"><g fill="currentColor"><g transform="translate(21 17) rotate(0)"><path d="M0 0 C -3 -4 -3 -10 0 -13 C 3 -10 3 -4 0 0 Z"/></g><g transform="translate(21 17) rotate(-34)"><path d="M0 0 C -3 -4 -3 -10 0 -13 C 3 -10 3 -4 0 0 Z"/></g><g transform="translate(21 17) rotate(34)"><path d="M0 0 C -3 -4 -3 -10 0 -13 C 3 -10 3 -4 0 0 Z"/></g></g></svg><div style="font-family:'Oswald',sans-serif;font-weight:600;font-size:20px;line-height:1.05;letter-spacing:0.5px;text-transform:uppercase">AROMA</div>
    <div style="font-family:'Oswald',sans-serif;font-weight:600;font-size:20px;line-height:1.05;letter-spacing:0.5px;text-transform:uppercase">THERAPY</div>
  </div>

  <div style="position:absolute;left:75px;bottom:192px;width:220px;text-align:center;font-family:'Open Sans',sans-serif;font-size:18px;font-weight:500;line-height:1.3;letter-spacing:1px;color:#1c1f22;white-space:nowrap;text-shadow:0 0 4px rgba(255,255,255,0.9)">{{issued_date}}</div>
  <div style="position:absolute;left:75px;width:220px;text-align:center;font-size:18px;letter-spacing:0.3px;bottom:153px">DATE</div>

  <div style="position:absolute;left:486px;top:864px;width:250px;height:82px;display:flex;align-items:flex-end;justify-content:center;pointer-events:none">
    <div style="font-family:'Mrs Saint Delafield',cursive;font-size:48px;line-height:1;color:#1e2b4d;white-space:nowrap;transform:rotate(-6deg);transform-origin:center bottom;padding:0 12px 4px 12px;width:192px;height:41px">Kim Bongjin</div>
  </div>
  <div style="position:absolute;left:500px;width:220px;text-align:center;font-size:18px;letter-spacing:0.3px;bottom:153px">SIGNATURE</div>
</div>
</body>
</html>
`;

module.exports = { AROMA_TEMPLATE };
