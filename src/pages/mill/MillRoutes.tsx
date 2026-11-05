import { Route, Routes, useParams } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import BatchPage from './BatchPage';
import MillPage from './MillPage';
import RecipeBuilderPage from './RecipeBuilderPage';
import RecipePage from './RecipePage';

// معمل العلف (0015) تحت /mill: الخلطات بطاقاتٍ، وبطاقة الخلطة، وبطاقة دفعة الإنتاج، وبانية الخلطة الجديدة بشاشة واحدة (0016).
// حزمة كسولة واحدة (تُفتح معاً دائماً: من البطاقة إلى الدفعة)، ولا تدخل التثبيت المسبق (الإنتاج يحتاج النت: سحب من دفعات
// حقيقية).

/**
 * صفحتا الدفعة والخلطة بمفتاح معرّفهما (الجولة السادسة، ب٦٥): الانتقال بالرابط من دفعة إلى أخرى (أو من خلطة إلى أخرى) يركّب الصفحة من
 * جديد، فلا تبقى فيها حقول السابقة ومسوّداتها ولا جملها، ولا يُرسل منها شيء على المعرّف الجديد. لا يُعتمد على مفتاح المسار في القشرة.
 */
function BatchById() {
  const { id = '' } = useParams();
  return <BatchPage key={id} />;
}

function RecipeById() {
  const { id = '' } = useParams();
  return <RecipePage key={id} />;
}

export default function MillRoutes() {
  return (
    <Routes>
      <Route index element={<MillPage />} />
      <Route path="new" element={<RecipeBuilderPage />} />
      <Route path="recipe/:id" element={<RecipeById />} />
      <Route path="batch/:id" element={<BatchById />} />
      <Route path="*" element={<Notice tone="info" title={t('mill.not_found', 'هذه الصفحة غير موجودة في المعمل.')} />} />
    </Routes>
  );
}
