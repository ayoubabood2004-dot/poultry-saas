// الخطوط مستضافة ويّا التطبيق (woff2 بقائمة التثبيت المسبق) حتى الفتح البارد بلا نت ما يطلع مكسوراً.
// المجموعة العربية بس من IBM Plex Sans Arabic، واللاتينية من Inter.
// الأوزان المستعملة بس: 400، 500 (font-medium، بلاه ينرسم 400)، 600 (font-semibold). ماكو 700 بالواجهة،
// و<b> بلاه ياخذ 600. كل وزن ملفّين بقائمة التثبيت المسبق، فما نزيد وزن ما ينستعمل.
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-500.css';
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initWesternDigits } from './lib/digits';
import { initDisplay } from './lib/display';
import { initOnline } from './lib/online';
import { initDirtyGuard } from './lib/pwa/dirty';
import { initInstall } from './lib/pwa/install';
import { ensurePersisted } from './lib/pwa/persist';
import { initRecovery } from './lib/pwa/recovery';
import { registerServiceWorker } from './lib/pwa/update';

initWesternDigits();
initDisplay();
initOnline();
initInstall();
initDirtyGuard();
initRecovery();
registerServiceWorker();
void ensurePersisted();

const root = document.getElementById('root');
if (!root) throw new Error('root_missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
