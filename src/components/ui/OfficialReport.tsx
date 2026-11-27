import './official.css';

// حامل أنماط التقرير الرسميّ في حزمة القاعات (القطع نفسها في officialParts.tsx بلا أنماط): من يستعمل variant="official" في حزمة القاعات يستورد من هنا
// فيحمل official.css (فحص official-tables G)؛ و«الرصيد اليوميّ» في حزمة المخزون يحملها بـdayReport.css. والحزمتان خارج التثبيت المسبق بالاسم.
export * from './officialParts';
