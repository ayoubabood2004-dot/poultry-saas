import { Route, Routes } from 'react-router-dom';
import { Notice } from '../../components/ui/Notice';
import { t } from '../../lib/i18n';
import BatchPage from './BatchPage';
import MillPage from './MillPage';
import RecipeBuilderPage from './RecipeBuilderPage';
import RecipePage from './RecipePage';

// معمل العلف (0015) تحت /mill: الخلطات بطاقاتٍ، وبطاقة الخلطة، وبطاقة دفعة الإنتاج، وبانية الخلطة الجديدة بشاشة واحدة (0016).
// حزمة كسولة واحدة (تُفتح معاً دائماً: من البطاقة إلى الدفعة)، ولا تدخل التثبيت المسبق (الإنتاج يحتاج النت: سحب من دفعات
// حقيقية).

export default function MillRoutes() {
  return (
    <Routes>
      <Route index element={<MillPage />} />
      <Route path="new" element={<RecipeBuilderPage />} />
      <Route path="recipe/:id" element={<RecipePage />} />
      <Route path="batch/:id" element={<BatchPage />} />
      <Route path="*" element={<Notice tone="info" title={t('mill.not_found', 'هذه الصفحة غير موجودة في المعمل.')} />} />
    </Routes>
  );
}
