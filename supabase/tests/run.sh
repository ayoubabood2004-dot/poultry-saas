#!/usr/bin/env bash
# حزمة بوستغريس الحقيقية (FOUNDATION): الشغل كلّه بـrun.mjs، وهذا المدخل اللي يسمّيه أمر التأسيس وCI.
set -euo pipefail
node "$(dirname "$0")/run.mjs" "$@"
