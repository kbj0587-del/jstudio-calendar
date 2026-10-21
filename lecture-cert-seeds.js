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
html,body{margin:0;padding:0;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;font-family:'Open Sans','Noto Sans KR',sans-serif;color:#26292c;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert img{image-rendering:auto}
</style>
</head>
<body>
<div class="cert">
  <img src="https://mjs.ai.kr/cert-assets/aroma-cert-bg@300.jpg" alt="" style="position:absolute;left:0;top:0;width:794px;height:1123px;object-fit:fill">
  <div style="position:absolute;left:0;top:0;width:794px;height:1123px;background:#ffffff;opacity:0.5;pointer-events:none"></div>
  <img src="https://mjs.ai.kr/cert-assets/aroma-cert-frame@300.png" alt="" style="position:absolute;left:0;top:0;width:794px;height:1123px;object-fit:fill;pointer-events:none">

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

const FLYING_LOW = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>플라잉요가 자격증</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Cinzel:wght@400;500;600&family=Kaushan+Script&display=swap">
<style>
@font-face{font-family:'aMapsiB';src:url('https://www.mjs.ai.kr/cert-assets/fonts/amapsib.ttf') format('truetype');font-display:swap}
@font-face{font-family:'aCheerleader';src:url('https://www.mjs.ai.kr/cert-assets/fonts/acheerleader.ttf') format('truetype');font-display:swap}
@font-face{font-family:'LeferiPointBlack';src:url('https://www.mjs.ai.kr/cert-assets/fonts/leferipointblack.ttf') format('truetype');font-display:swap}
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;font-family:'Noto Sans KR',sans-serif;color:#333333;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff url('https://www.mjs.ai.kr/cert-assets/flying-cert-bg-dither@300.jpg') no-repeat center/100% 100%;transform:translateZ(0);backface-visibility:hidden}
.gold{color:#c4a24a}
</style>
</head>
<body>
<div class="cert">

  <div class="gold" style="position:absolute;left:0;top:192px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:42px;line-height:1;letter-spacing:5px;margin-right:-5px">FLYINGYOGA</div>
  <div class="gold" style="position:absolute;left:0;top:246px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:12.5px;line-height:1;letter-spacing:3px;margin-right:-3px">LOW FLYING FOUNDATION COURSE CERTIFICATE</div>

  <div style="position:absolute;left:46px;top:30px;font-family:'Noto Sans KR',Arial,sans-serif;font-size:10.85px;line-height:1.5;color:#a0a0a0;white-space:nowrap">Certification No. 2022-001526<br>Reference No. {{cert_no}}</div>

  <div style="position:absolute;left:97px;top:416px;width:600px;text-align:center;font-family:'aMapsiB','Times New Roman',serif;font-weight:700;font-size:46.5px;line-height:1;color:#333333;white-space:nowrap"><span style="display:inline-block;border-bottom:1.6px solid rgba(85,85,85,.6);padding-bottom:9px">{{holder_name}}</span></div>

  <div style="position:absolute;left:67px;top:500px;width:660px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:19px;line-height:32px;color:#333333">This is to certify that the above-named person has faithfully completed the prescribed training course in accordance with the institute's qualification management regulations, diligently fulfilled the required theoretical and practical training, and passed the designated qualification evaluation and examination, thereby satisfying all requirements for the qualification. This certificate is hereby awarded.</div>

  <div style="position:absolute;left:87px;top:696px;width:620px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:16px;line-height:32px;color:#333333;word-break:keep-all">위 사람은 본원의 자격관리 규정에 따라 정해진 교육과정을 성실히 이수하고, 교육과정에서 요구하는 이론 및 실기 교육을 충실히 수행하였으며, 소정의 자격평가 및 자격시험에 합격하여 해당 자격에 필요한 요건을 갖추었기에 본 자격을 부여하고 이 증서를 수여합니다.</div>

  <div style="position:absolute;left:240px;top:857px;width:300px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:1;color:#333333;white-space:nowrap">{{issued_date_ko}}</div>

  <div style="position:absolute;left:190px;top:959px;width:400px;text-align:center;font-family:'aCheerleader','Noto Sans KR',sans-serif;font-weight:900;font-size:40px;line-height:1;color:#333333;white-space:nowrap">제이스튜디오</div>
  <div style="position:absolute;left:233px;top:1007px;width:300px;text-align:center;font-family:'LeferiPointBlack','Noto Sans KR',sans-serif;font-weight:700;font-size:18.65px;line-height:1;color:#504f4f;white-space:nowrap">플라잉요가&amp;번지피지오</div>

  <div style="position:absolute;left:524px;top:960px;width:280px;text-align:center;font-family:'Kaushan Script',cursive;font-size:30px;line-height:1;color:#1e2b4d;white-space:nowrap">Kim hyun jung</div>
  <div style="position:absolute;left:579px;top:999px;width:170px;height:1.2px;background:#555555;opacity:.6"></div>
  <div style="position:absolute;left:549px;top:1006px;width:200px;text-align:center;font-family:'Times New Roman',Times,serif;font-size:16px;line-height:1;color:#333333;white-space:nowrap">President</div>
</div>
</body>
</html>
`;

const FLYING_HIGH = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>플라잉요가 자격증</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Cinzel:wght@400;500;600&family=Kaushan+Script&display=swap">
<style>
@font-face{font-family:'aMapsiB';src:url('https://www.mjs.ai.kr/cert-assets/fonts/amapsib.ttf') format('truetype');font-display:swap}
@font-face{font-family:'aCheerleader';src:url('https://www.mjs.ai.kr/cert-assets/fonts/acheerleader.ttf') format('truetype');font-display:swap}
@font-face{font-family:'LeferiPointBlack';src:url('https://www.mjs.ai.kr/cert-assets/fonts/leferipointblack.ttf') format('truetype');font-display:swap}
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;font-family:'Noto Sans KR',sans-serif;color:#333333;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff url('https://www.mjs.ai.kr/cert-assets/flying-cert-bg-dither@300.jpg') no-repeat center/100% 100%;transform:translateZ(0);backface-visibility:hidden}
.gold{color:#c4a24a}
</style>
</head>
<body>
<div class="cert">

  <div class="gold" style="position:absolute;left:0;top:192px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:42px;line-height:1;letter-spacing:5px;margin-right:-5px">FLYINGYOGA</div>
  <div class="gold" style="position:absolute;left:0;top:246px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:12.5px;line-height:1;letter-spacing:3px;margin-right:-3px">HIGH FLYING FOUNDATION COURSE CERTIFICATE</div>

  <div style="position:absolute;left:46px;top:30px;font-family:'Noto Sans KR',Arial,sans-serif;font-size:10.85px;line-height:1.5;color:#a0a0a0;white-space:nowrap">Certification No. 2022-001526<br>Reference No. {{cert_no}}</div>

  <div style="position:absolute;left:97px;top:416px;width:600px;text-align:center;font-family:'aMapsiB','Times New Roman',serif;font-weight:700;font-size:46.5px;line-height:1;color:#333333;white-space:nowrap"><span style="display:inline-block;border-bottom:1.6px solid rgba(85,85,85,.6);padding-bottom:9px">{{holder_name}}</span></div>

  <div style="position:absolute;left:67px;top:500px;width:660px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:19px;line-height:32px;color:#333333">This is to certify that the above-named person has faithfully completed the prescribed training course in accordance with the institute's qualification management regulations, diligently fulfilled the required theoretical and practical training, and passed the designated qualification evaluation and examination, thereby satisfying all requirements for the qualification. This certificate is hereby awarded.</div>

  <div style="position:absolute;left:87px;top:696px;width:620px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:16px;line-height:32px;color:#333333;word-break:keep-all">위 사람은 본원의 자격관리 규정에 따라 정해진 교육과정을 성실히 이수하고, 교육과정에서 요구하는 이론 및 실기 교육을 충실히 수행하였으며, 소정의 자격평가 및 자격시험에 합격하여 해당 자격에 필요한 요건을 갖추었기에 본 자격을 부여하고 이 증서를 수여합니다.</div>

  <div style="position:absolute;left:240px;top:857px;width:300px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:1;color:#333333;white-space:nowrap">{{issued_date_ko}}</div>

  <div style="position:absolute;left:190px;top:959px;width:400px;text-align:center;font-family:'aCheerleader','Noto Sans KR',sans-serif;font-weight:900;font-size:40px;line-height:1;color:#333333;white-space:nowrap">제이스튜디오</div>
  <div style="position:absolute;left:233px;top:1007px;width:300px;text-align:center;font-family:'LeferiPointBlack','Noto Sans KR',sans-serif;font-weight:700;font-size:18.65px;line-height:1;color:#504f4f;white-space:nowrap">플라잉요가&amp;번지피지오</div>

  <div style="position:absolute;left:524px;top:960px;width:280px;text-align:center;font-family:'Kaushan Script',cursive;font-size:30px;line-height:1;color:#1e2b4d;white-space:nowrap">Kim hyun jung</div>
  <div style="position:absolute;left:579px;top:999px;width:170px;height:1.2px;background:#555555;opacity:.6"></div>
  <div style="position:absolute;left:549px;top:1006px;width:200px;text-align:center;font-family:'Times New Roman',Times,serif;font-size:16px;line-height:1;color:#333333;white-space:nowrap">President</div>
</div>
</body>
</html>
`;

const FLYING_GEN = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>플라잉요가 자격증</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Cinzel:wght@400;500;600&family=Kaushan+Script&display=swap">
<style>
@font-face{font-family:'aMapsiB';src:url('https://www.mjs.ai.kr/cert-assets/fonts/amapsib.ttf') format('truetype');font-display:swap}
@font-face{font-family:'aCheerleader';src:url('https://www.mjs.ai.kr/cert-assets/fonts/acheerleader.ttf') format('truetype');font-display:swap}
@font-face{font-family:'LeferiPointBlack';src:url('https://www.mjs.ai.kr/cert-assets/fonts/leferipointblack.ttf') format('truetype');font-display:swap}
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;font-family:'Noto Sans KR',sans-serif;color:#333333;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff url('https://www.mjs.ai.kr/cert-assets/flying-cert-bg-dither@300.jpg') no-repeat center/100% 100%;transform:translateZ(0);backface-visibility:hidden}
.gold{color:#c4a24a}
</style>
</head>
<body>
<div class="cert">

  <div class="gold" style="position:absolute;left:0;top:192px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:42px;line-height:1;letter-spacing:5px;margin-right:-5px">FLYINGYOGA</div>
  <div class="gold" style="position:absolute;left:0;top:246px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:12.5px;line-height:1;letter-spacing:3px;margin-right:-3px">FOUNDATION COURSE CERTIFICATE</div>

  <div style="position:absolute;left:46px;top:30px;font-family:'Noto Sans KR',Arial,sans-serif;font-size:10.85px;line-height:1.5;color:#a0a0a0;white-space:nowrap">Certification No. 2022-001526<br>Reference No. {{cert_no}}</div>

  <div style="position:absolute;left:97px;top:416px;width:600px;text-align:center;font-family:'aMapsiB','Times New Roman',serif;font-weight:700;font-size:46.5px;line-height:1;color:#333333;white-space:nowrap"><span style="display:inline-block;border-bottom:1.6px solid rgba(85,85,85,.6);padding-bottom:9px">{{holder_name}}</span></div>

  <div style="position:absolute;left:67px;top:500px;width:660px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:19px;line-height:32px;color:#333333">This is to certify that the above-named person has faithfully completed the prescribed training course in accordance with the institute's qualification management regulations, diligently fulfilled the required theoretical and practical training, and passed the designated qualification evaluation and examination, thereby satisfying all requirements for the qualification. This certificate is hereby awarded.</div>

  <div style="position:absolute;left:87px;top:696px;width:620px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:16px;line-height:32px;color:#333333;word-break:keep-all">위 사람은 본원의 자격관리 규정에 따라 정해진 교육과정을 성실히 이수하고, 교육과정에서 요구하는 이론 및 실기 교육을 충실히 수행하였으며, 소정의 자격평가 및 자격시험에 합격하여 해당 자격에 필요한 요건을 갖추었기에 본 자격을 부여하고 이 증서를 수여합니다.</div>

  <div style="position:absolute;left:240px;top:857px;width:300px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:1;color:#333333;white-space:nowrap">{{issued_date_ko}}</div>

  <div style="position:absolute;left:190px;top:959px;width:400px;text-align:center;font-family:'aCheerleader','Noto Sans KR',sans-serif;font-weight:900;font-size:40px;line-height:1;color:#333333;white-space:nowrap">제이스튜디오</div>
  <div style="position:absolute;left:233px;top:1007px;width:300px;text-align:center;font-family:'LeferiPointBlack','Noto Sans KR',sans-serif;font-weight:700;font-size:18.65px;line-height:1;color:#504f4f;white-space:nowrap">플라잉요가&amp;번지피지오</div>

  <div style="position:absolute;left:524px;top:960px;width:280px;text-align:center;font-family:'Kaushan Script',cursive;font-size:30px;line-height:1;color:#1e2b4d;white-space:nowrap">Kim hyun jung</div>
  <div style="position:absolute;left:579px;top:999px;width:170px;height:1.2px;background:#555555;opacity:.6"></div>
  <div style="position:absolute;left:549px;top:1006px;width:200px;text-align:center;font-family:'Times New Roman',Times,serif;font-size:16px;line-height:1;color:#333333;white-space:nowrap">President</div>
</div>
</body>
</html>
`;

// 자격증 표지: 흰 배경 중앙에 제이스튜디오 로고+상호, 그 아래 응원 문구({{cheer_message}})를
// 인쇄 시점에 입력받아 포함. 다른 자격증과 세트로 묶이도록 A4 세로.
const COVER = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>자격증 표지</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&family=Gowun+Batang:wght@400;700&family=Song+Myung&family=Nanum+Brush+Script&family=Nanum+Pen+Script&family=Gaegu:wght@400;700&family=Noto+Sans+KR:wght@400;500;700&display=swap">
<style>
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;background:#ffffff;font-family:'Noto Sans KR',sans-serif;color:#333333;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
</style>
</head>
<body>
<div class="cert">
  <img src="https://www.mjs.ai.kr/cert-assets/cover-artwork@300.png" alt="제이스튜디오" style="position:absolute;left:247px;top:225px;width:300px;height:365px;object-fit:contain">
  <div style="position:absolute;left:397px;top:691px;transform:translateX(-50%);width:70px;height:2px;background:#c4a24a;opacity:.7"></div>
  <div style="position:absolute;left:117px;top:733px;width:560px;text-align:center;font-family:{{cheer_font}};font-weight:400;font-size:24px;line-height:1.95;color:#5c4e2e;white-space:pre-line;word-break:keep-all">{{cheer_message}}</div>
</div>
</body>
</html>
`;

const WORKSHOP = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>워크숍 수료증</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=Nanum+Myeongjo:wght@400;700;800&family=Noto+Sans+KR:wght@400;500;700&family=Marcellus&family=Great+Vibes&family=Allura&family=Parisienne&family=Playfair+Display:wght@600&family=Cormorant+Garamond:wght@600&family=Alex+Brush&family=Sacramento&family=Pinyon+Script&family=Nanum+Brush+Script&family=Nanum+Pen+Script&display=swap">
<style>
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#e9e4d8;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;margin:0 auto;
  font-family:'Nanum Myeongjo','Noto Sans KR',serif;color:#4a3f2e;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
  background:#f3ecd9 url('https://www.mjs.ai.kr/cert-assets/afy-cert-bg@300.jpg') no-repeat center/100% 100%}
.wash{position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.35),rgba(255,255,255,0) 40%)}
.swoosh{position:absolute}
.frame-outer{position:absolute;inset:24px;border:2px solid #c9ad7a}
.frame-inner{position:absolute;inset:34px;border:1px solid #c9ad7a}
.corner{position:absolute;width:62px;height:62px;border:2px solid #b89b66}
.c-tl{left:12px;top:12px;border-right:0;border-bottom:0}
.c-tr{right:12px;top:12px;border-left:0;border-bottom:0}
.c-bl{left:12px;bottom:12px;border-right:0;border-top:0}
.c-br{right:12px;bottom:12px;border-left:0;border-top:0}
.emblem{position:absolute;left:50%;top:50px;transform:translateX(-50%);width:174px;height:182px;object-fit:contain}
.cTitle{position:absolute;left:0;right:0;top:252px;text-align:center;font-family:'Cinzel',serif;font-weight:600;font-size:62px;letter-spacing:2px;color:#6b4f2a;margin-right:-2px}
.cSub{position:absolute;left:0;right:0;top:330px;text-align:center;display:flex;align-items:center;justify-content:center;gap:16px}
.cSub .ln{width:120px;height:1px;background:#bfa06a}
.cSub .tx{font-family:'Cinzel',serif;letter-spacing:6px;font-size:17px;color:#8a6d3f;margin-right:-6px}
.cBlock{position:absolute;left:0;right:0;top:432px;text-align:center}
.cBlock .wrap{display:inline-block;min-width:260px}
.cBlock .nm{display:block;font-weight:400;letter-spacing:1px;margin-right:0;color:#2f2718;white-space:nowrap;line-height:1;height:0.78em;overflow:visible;padding:0 26px 0}
.cBlock .divider{display:flex;align-items:center;gap:14px;width:100%}
.cBlock .divider .ln{flex:1;height:1px;background:#b89b66}
.cBlock .divider .d{flex:none;width:9px;height:9px;background:#b08d57;transform:rotate(45deg)}
.cQuote{position:absolute;left:97px;width:600px;top:532px;text-align:center;font-weight:700;font-style:italic;font-size:27px;color:#5c4a2c;letter-spacing:.3px}
.cBody{position:absolute;left:137px;width:520px;top:626px;text-align:center;font-size:17px;line-height:2.05;color:#4a3f2e;word-break:keep-all}
.cBody b{color:#6b4f2a;font-weight:800}
.cCurric{position:absolute;left:97px;width:600px;top:782px;text-align:center;font-size:15.5px;color:#8a6d3f;font-weight:700;letter-spacing:.3px}
.cDate{position:absolute;left:0;right:0;top:852px;text-align:center;font-size:18px;color:#4a3f2e;letter-spacing:1px}
.sig{position:absolute;bottom:112px;width:276px;text-align:center}
.sig.left{left:107px}.sig.right{right:107px}
.sig .nm{color:#2e2a22;line-height:1;height:0.92em;letter-spacing:.5px;white-space:nowrap}
.sig .ul{height:1px;background:#8d7a56;opacity:.6;margin:1px 20px 7px}
.sig .rl{font-family:'Cinzel',serif;letter-spacing:2px;font-size:16px;color:#6f5c38}
.cNo{position:absolute;left:46px;bottom:50px;font-family:'Noto Sans KR',sans-serif;font-size:11px;letter-spacing:.4px;color:#9a8a68}
.silho{position:absolute;right:40px;bottom:150px;width:210px;height:430px;opacity:.5}
</style>
</head>
<body>
<div class="cert" data-namefont="font-family:'Great Vibes',cursive;font-size:54px" data-sigfont="font-family:'Parisienne',cursive;font-size:26px">
  <img class="emblem" src="https://www.mjs.ai.kr/cert-assets/afy-logo.png" alt="ALL FLYING YOGA">

  <div class="cTitle">CERTIFICATE</div>
  <div class="cSub"><span class="ln"></span><span class="tx">OF COMPLETION</span><span class="ln"></span></div>

  <div class="cBlock"><div class="wrap">
    <div class="nm" style="{{name_style}}">{{holder_name}}</div>
    <div class="divider"><span class="ln"></span></div>
  </div></div>

  <div class="cQuote" data-edit="quote">“움직임이 아니라 회복을 설계하다”</div>

  <div class="cBody" data-edit="body">위 사람은 <b>올플라잉요가 송도점 본원</b>에서 진행된<br>‘김현정의 로우플라잉 원데이 워크숍’의 전 과정을 성실히<br>이수하였으므로 이 수료증을 수여합니다.</div>

  <div class="cCurric" data-edit="curriculum">교육 내용 : 이론 + 핸즈온 실습 + 아로마 감각 체험</div>

  <div class="cDate">{{issued_date_ko}}</div>

  <div class="sig left">
    <div class="nm" data-edit="instructor" style="{{sig_style}}">Kim Hyunjung</div>
    <div class="ul"></div>
    <div class="rl">Instructor</div>
  </div>
  <div class="sig right">
    <div class="nm" data-edit="director" style="{{sig_style}}">Park Dahyun</div>
    <div class="ul"></div>
    <div class="rl">Director</div>
  </div>

  <div class="cNo">발급번호 Issue No. &nbsp;{{cert_no}}</div>

  </div>
</body>
</html>
`;

const CERT_SEEDS = [
  { name: "아로마 전문 지도사", issuer: "미사 제이스튜디오", template: AROMA_TEMPLATE },
  { name: "로우플라잉요가 자격증", issuer: "제이스튜디오", template: FLYING_LOW },
  { name: "하이플라잉요가 자격증", issuer: "제이스튜디오", template: FLYING_HIGH },
  { name: "플라잉요가 자격증", issuer: "제이스튜디오", template: FLYING_GEN },
  { name: "자격증 표지", issuer: "제이스튜디오", template: COVER },
  { name: "워크숍 수료증", issuer: "올플라잉요가", template: WORKSHOP },
];

module.exports = { AROMA_TEMPLATE, FLYING_LOW, FLYING_HIGH, FLYING_GEN, COVER, WORKSHOP, CERT_SEEDS };
