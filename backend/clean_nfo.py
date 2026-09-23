"""NFO 标签清理工具命令行快捷入口。"""

from __future__ import annotations

import sys
from app.core.nfo_cleaner import main

if __name__ == "__main__":
    sys.exit(main())
