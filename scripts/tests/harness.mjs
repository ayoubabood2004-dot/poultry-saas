// إطار فحص صغير: يطبع ✓/✗ ويطلع بغير صفر. ماكو تسامح: bigint تتقارن بالضبط.

function show(value) {
  return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? `${v}n` : v));
}

export function createHarness() {
  let passed = 0;
  const failures = [];
  const t = {
    eq(actual, expected, label) {
      if (Object.is(actual, expected)) passed += 1;
      else failures.push(`${label}: المتوقّع ${show(expected)} وطلع ${show(actual)}`);
    },
    same(actual, expected, label) {
      if (show(actual) === show(expected)) passed += 1;
      else failures.push(`${label}: المتوقّع ${show(expected)} وطلع ${show(actual)}`);
    },
    ok(condition, label) {
      if (condition) passed += 1;
      else failures.push(`${label}: طلع خطأ`);
    },
    throws(fn, label, pattern) {
      try {
        fn();
        failures.push(`${label}: ما رمى`);
      } catch (error) {
        if (pattern && !pattern.test(String(error?.message ?? error))) failures.push(`${label}: رمى «${error?.message}» مو المتوقّع`);
        else passed += 1;
      }
    },
    async rejects(promise, label, pattern) {
      try {
        await promise;
        failures.push(`${label}: ما رمى`);
      } catch (error) {
        if (pattern && !pattern.test(String(error?.message ?? error))) failures.push(`${label}: رمى «${error?.message}» مو المتوقّع`);
        else passed += 1;
      }
    },
  };
  return { t, result: () => ({ passed, failures }) };
}
