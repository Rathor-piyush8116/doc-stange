import sys
from main import main

if __name__ == "__main__":
    if "--manual" not in sys.argv:
        sys.argv.append("--manual")
    main()
