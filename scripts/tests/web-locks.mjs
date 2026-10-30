// مدير أقفال Web Locks بالعملية نفسها لفحوص الرفّ: «نافذة ثانية» تمسك القفل باسمه. يتبع المواصفة بالقدر اللي تستخدمه الشاشة:
// حصري ومشترك؛ ifAvailable (ما ينمنح فوراً ← المعالج بـnull)؛ انتظار بطابور لكل اسم بالترتيب (أوّل الطابور بس ينمنح، وطلب جديد ما
// يتخطّى منتظراً)؛ signal يشيل المنتظر ويرفض بـAbortError؛ والفلت قبل ما يرجع الوعد؛ وquery بالممسوك والمنتظر.

function abortError() {
  return Object.assign(new Error('The request was aborted.'), { name: 'AbortError' });
}

export function installLocks() {
  const held = [];
  const queue = [];
  const compatible = (name, mode) => {
    const holding = held.filter((lock) => lock.name === name);
    return mode === 'shared' ? holding.every((lock) => lock.mode === 'shared') : holding.length === 0;
  };
  const grantable = (request) => {
    const first = queue.find((waiting) => waiting.name === request.name);
    return (!first || first === request) && compatible(request.name, request.mode);
  };
  const grant = (request) => {
    const lock = { name: request.name, mode: request.mode };
    held.push(lock);
    let result;
    try {
      result = Promise.resolve(request.run(lock));
    } catch (error) {
      result = Promise.reject(error);
    }
    const release = () => {
      held.splice(held.indexOf(lock), 1);
      pump();
    };
    result.then(
      (value) => {
        release();
        request.resolve(value);
      },
      (error) => {
        release();
        request.reject(error);
      },
    );
  };
  const pump = () => {
    for (let at = 0; at < queue.length; ) {
      const request = queue[at];
      if (grantable(request)) {
        queue.splice(at, 1);
        grant(request);
        at = 0;
      } else at += 1;
    }
  };
  const locks = {
    request(name, options, callback) {
      const run = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'object' && options !== null ? options : {};
      return new Promise((resolve, reject) => {
        if (opts.signal?.aborted) {
          reject(abortError());
          return;
        }
        const request = { name, mode: opts.mode ?? 'exclusive', run, resolve, reject };
        if (grantable(request)) {
          grant(request);
          return;
        }
        if (opts.ifAvailable) {
          try {
            Promise.resolve(run(null)).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
          return;
        }
        queue.push(request);
        opts.signal?.addEventListener(
          'abort',
          () => {
            const at = queue.indexOf(request);
            if (at < 0) return;
            queue.splice(at, 1);
            reject(abortError());
            pump();
          },
          { once: true },
        );
      });
    },
    async query() {
      return { held: held.map(({ name, mode }) => ({ name, mode })), pending: queue.map(({ name, mode }) => ({ name, mode })) };
    },
  };
  const before = Object.getOwnPropertyDescriptor(globalThis.navigator, 'locks');
  Object.defineProperty(globalThis.navigator, 'locks', { value: locks, configurable: true });
  return {
    locks,
    /** المنتظرون الآن (لفحص إن الرفّ ألغى انتظاره لمّا انغلق). */
    pending: () => queue.map(({ name, mode }) => ({ name, mode })),
    restore: () => {
      if (before) Object.defineProperty(globalThis.navigator, 'locks', before);
      else delete globalThis.navigator.locks;
    },
  };
}
