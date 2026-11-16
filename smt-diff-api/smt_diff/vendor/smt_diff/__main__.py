"""Allow ``python -m smt_diff script-a.smt2 script-b.smt2``."""

import sys

from .cli import main

sys.exit(main())
