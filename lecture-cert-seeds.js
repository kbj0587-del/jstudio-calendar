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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Cinzel:wght@400;500;600&display=swap">
<style>
@font-face{font-family:'aMapsiB';src:url('https://www.mjs.ai.kr/cert-assets/fonts/amapsib.ttf') format('truetype');font-display:swap}
@font-face{font-family:'aCheerleader';src:url('https://www.mjs.ai.kr/cert-assets/fonts/acheerleader.ttf') format('truetype');font-display:swap}
@font-face{font-family:'LeferiPointBlack';src:url('https://www.mjs.ai.kr/cert-assets/fonts/leferipointblack.ttf') format('truetype');font-display:swap}
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;font-family:'Noto Sans KR',sans-serif;color:#333333;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gold{color:#c7a24a;background:linear-gradient(180deg,#f6e6a6 0%,#d8b24f 42%,#b5872c 72%,#edd079 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
</style>
</head>
<body>
<div class="cert">
  <img src="https://www.mjs.ai.kr/cert-assets/flying-cert-bg-clean@300.jpg" alt="" style="position:absolute;left:0;top:0;width:794px;height:1123px;object-fit:fill">

  <div class="gold" style="position:absolute;left:0;top:192px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:42px;line-height:1;letter-spacing:5px;margin-right:-5px">FLYINGYOGA</div>
  <div class="gold" style="position:absolute;left:0;top:246px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:12.5px;line-height:1;letter-spacing:3px;margin-right:-3px">LOW FLYING FOUNDATION COURSE CERTIFICATE</div>

  <div style="position:absolute;left:52px;top:46px;font-family:'Noto Sans KR',Arial,sans-serif;font-size:10.85px;line-height:1.5;color:#a0a0a0;white-space:nowrap">Certification No. 2022-001526<br>발급번호 {{cert_no}}</div>

  <div style="position:absolute;left:97px;top:416px;width:600px;text-align:center;font-family:'aMapsiB','Times New Roman',serif;font-weight:700;font-size:46.5px;line-height:1;color:#333333;white-space:nowrap">{{holder_name}}</div>
  <div style="position:absolute;left:247px;top:466px;width:300px;height:1.4px;background:#555555;opacity:.6"></div>

  <div style="position:absolute;left:47px;top:508px;width:700px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:23.25px;line-height:41.06px;color:#333333;white-space:pre-line">This certificate is presented to prove
that you have completed the training course
recognised by Flyart Yoga and have passed
the qualification verification corresponding to the course.</div>

  <div style="position:absolute;left:120px;top:695px;width:600px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:41.06px;color:#333333;white-space:pre-line;word-break:keep-all">위 사람은 본원의 자격관리 기준에 의거하여 교육과정을 이수하고
소정의 자격시험에 합격하여 본 증서를 수여합니다.</div>

  <div style="position:absolute;left:240px;top:857px;width:300px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:1;color:#333333;white-space:nowrap">{{issued_date_ko}}</div>

  <div style="position:absolute;left:190px;top:959px;width:400px;text-align:center;font-family:'aCheerleader','Noto Sans KR',sans-serif;font-weight:900;font-size:40px;line-height:1;color:#333333;white-space:nowrap">제이스튜디오</div>
  <div style="position:absolute;left:233px;top:1007px;width:300px;text-align:center;font-family:'LeferiPointBlack','Noto Sans KR',sans-serif;font-weight:700;font-size:18.65px;line-height:1;color:#504f4f;white-space:nowrap">플라잉요가&amp;번지피지오</div>

  <div style="position:absolute;left:564px;top:973px;width:200px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:24px;line-height:1;color:#333333;white-space:nowrap">Kim hyun jung</div>
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Cinzel:wght@400;500;600&display=swap">
<style>
@font-face{font-family:'aMapsiB';src:url('https://www.mjs.ai.kr/cert-assets/fonts/amapsib.ttf') format('truetype');font-display:swap}
@font-face{font-family:'aCheerleader';src:url('https://www.mjs.ai.kr/cert-assets/fonts/acheerleader.ttf') format('truetype');font-display:swap}
@font-face{font-family:'LeferiPointBlack';src:url('https://www.mjs.ai.kr/cert-assets/fonts/leferipointblack.ttf') format('truetype');font-display:swap}
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;font-family:'Noto Sans KR',sans-serif;color:#333333;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gold{color:#c7a24a;background:linear-gradient(180deg,#f6e6a6 0%,#d8b24f 42%,#b5872c 72%,#edd079 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
</style>
</head>
<body>
<div class="cert">
  <img src="https://www.mjs.ai.kr/cert-assets/flying-cert-bg-clean@300.jpg" alt="" style="position:absolute;left:0;top:0;width:794px;height:1123px;object-fit:fill">

  <div class="gold" style="position:absolute;left:0;top:192px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:42px;line-height:1;letter-spacing:5px;margin-right:-5px">FLYINGYOGA</div>
  <div class="gold" style="position:absolute;left:0;top:246px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:12.5px;line-height:1;letter-spacing:3px;margin-right:-3px">HIGH FLYING FOUNDATION COURSE CERTIFICATE</div>

  <div style="position:absolute;left:52px;top:46px;font-family:'Noto Sans KR',Arial,sans-serif;font-size:10.85px;line-height:1.5;color:#a0a0a0;white-space:nowrap">Certification No. 2022-001526<br>발급번호 {{cert_no}}</div>

  <div style="position:absolute;left:97px;top:416px;width:600px;text-align:center;font-family:'aMapsiB','Times New Roman',serif;font-weight:700;font-size:46.5px;line-height:1;color:#333333;white-space:nowrap">{{holder_name}}</div>
  <div style="position:absolute;left:247px;top:466px;width:300px;height:1.4px;background:#555555;opacity:.6"></div>

  <div style="position:absolute;left:47px;top:508px;width:700px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:23.25px;line-height:41.06px;color:#333333;white-space:pre-line">This certificate is presented to prove
that you have completed the training course
recognised by Flyart Yoga and have passed
the qualification verification corresponding to the course.</div>

  <div style="position:absolute;left:120px;top:695px;width:600px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:41.06px;color:#333333;white-space:pre-line;word-break:keep-all">위 사람은 본원의 자격관리 기준에 의거하여 교육과정을 이수하고
소정의 자격시험에 합격하여 본 증서를 수여합니다.</div>

  <div style="position:absolute;left:240px;top:857px;width:300px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:1;color:#333333;white-space:nowrap">{{issued_date_ko}}</div>

  <div style="position:absolute;left:190px;top:959px;width:400px;text-align:center;font-family:'aCheerleader','Noto Sans KR',sans-serif;font-weight:900;font-size:40px;line-height:1;color:#333333;white-space:nowrap">제이스튜디오</div>
  <div style="position:absolute;left:233px;top:1007px;width:300px;text-align:center;font-family:'LeferiPointBlack','Noto Sans KR',sans-serif;font-weight:700;font-size:18.65px;line-height:1;color:#504f4f;white-space:nowrap">플라잉요가&amp;번지피지오</div>

  <div style="position:absolute;left:564px;top:973px;width:200px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:24px;line-height:1;color:#333333;white-space:nowrap">Kim hyun jung</div>
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=Cinzel:wght@400;500;600&display=swap">
<style>
@font-face{font-family:'aMapsiB';src:url('https://www.mjs.ai.kr/cert-assets/fonts/amapsib.ttf') format('truetype');font-display:swap}
@font-face{font-family:'aCheerleader';src:url('https://www.mjs.ai.kr/cert-assets/fonts/acheerleader.ttf') format('truetype');font-display:swap}
@font-face{font-family:'LeferiPointBlack';src:url('https://www.mjs.ai.kr/cert-assets/fonts/leferipointblack.ttf') format('truetype');font-display:swap}
@page{size:A4 portrait;margin:0}
html,body{margin:0;padding:0;background:#ffffff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{position:relative;width:794px;height:1123px;overflow:hidden;font-family:'Noto Sans KR',sans-serif;color:#333333;margin:0 auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.gold{color:#c7a24a;background:linear-gradient(180deg,#f6e6a6 0%,#d8b24f 42%,#b5872c 72%,#edd079 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
</style>
</head>
<body>
<div class="cert">
  <img src="https://www.mjs.ai.kr/cert-assets/flying-cert-bg-clean@300.jpg" alt="" style="position:absolute;left:0;top:0;width:794px;height:1123px;object-fit:fill">

  <div class="gold" style="position:absolute;left:0;top:192px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:42px;line-height:1;letter-spacing:5px;margin-right:-5px">FLYINGYOGA</div>
  <div class="gold" style="position:absolute;left:0;top:246px;width:794px;text-align:center;font-family:'Cinzel',serif;font-weight:500;font-size:12.5px;line-height:1;letter-spacing:3px;margin-right:-3px">FOUNDATION COURSE CERTIFICATE</div>

  <div style="position:absolute;left:52px;top:46px;font-family:'Noto Sans KR',Arial,sans-serif;font-size:10.85px;line-height:1.5;color:#a0a0a0;white-space:nowrap">Certification No. 2022-001526<br>발급번호 {{cert_no}}</div>

  <div style="position:absolute;left:97px;top:416px;width:600px;text-align:center;font-family:'aMapsiB','Times New Roman',serif;font-weight:700;font-size:46.5px;line-height:1;color:#333333;white-space:nowrap">{{holder_name}}</div>
  <div style="position:absolute;left:247px;top:466px;width:300px;height:1.4px;background:#555555;opacity:.6"></div>

  <div style="position:absolute;left:47px;top:508px;width:700px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:23.25px;line-height:41.06px;color:#333333;white-space:pre-line">This certificate is presented to prove
that you have completed the training course
recognised by Flyart Yoga and have passed
the qualification verification corresponding to the course.</div>

  <div style="position:absolute;left:120px;top:695px;width:600px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:41.06px;color:#333333;white-space:pre-line;word-break:keep-all">위 사람은 본원의 자격관리 기준에 의거하여 교육과정을 이수하고
소정의 자격시험에 합격하여 본 증서를 수여합니다.</div>

  <div style="position:absolute;left:240px;top:857px;width:300px;text-align:center;font-family:'Noto Sans KR',sans-serif;font-weight:500;font-size:18.6px;line-height:1;color:#333333;white-space:nowrap">{{issued_date_ko}}</div>

  <div style="position:absolute;left:190px;top:959px;width:400px;text-align:center;font-family:'aCheerleader','Noto Sans KR',sans-serif;font-weight:900;font-size:40px;line-height:1;color:#333333;white-space:nowrap">제이스튜디오</div>
  <div style="position:absolute;left:233px;top:1007px;width:300px;text-align:center;font-family:'LeferiPointBlack','Noto Sans KR',sans-serif;font-weight:700;font-size:18.65px;line-height:1;color:#504f4f;white-space:nowrap">플라잉요가&amp;번지피지오</div>

  <div style="position:absolute;left:564px;top:973px;width:200px;text-align:center;font-family:'Times New Roman',Times,serif;font-style:italic;font-size:24px;line-height:1;color:#333333;white-space:nowrap">Kim hyun jung</div>
  <div style="position:absolute;left:579px;top:999px;width:170px;height:1.2px;background:#555555;opacity:.6"></div>
  <div style="position:absolute;left:549px;top:1006px;width:200px;text-align:center;font-family:'Times New Roman',Times,serif;font-size:16px;line-height:1;color:#333333;white-space:nowrap">President</div>
</div>
</body>
</html>
`;

const CERT_SEEDS = [
  { name: "아로마 전문 지도사", issuer: "미사 제이스튜디오", template: AROMA_TEMPLATE },
  { name: "로우플라잉요가 자격증", issuer: "제이스튜디오", template: FLYING_LOW },
  { name: "하이플라잉요가 자격증", issuer: "제이스튜디오", template: FLYING_HIGH },
  { name: "플라잉요가 자격증", issuer: "제이스튜디오", template: FLYING_GEN },
];

module.exports = { AROMA_TEMPLATE, FLYING_LOW, FLYING_HIGH, FLYING_GEN, CERT_SEEDS };
