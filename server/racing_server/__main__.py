import os

import uvicorn


def main() -> None:
    uvicorn.run(
        "racing_server.app:app",
        host=os.environ.get("RACING_HOST", "127.0.0.1"),
        port=int(os.environ.get("RACING_PORT", "8000")),
        reload=bool(os.environ.get("RACING_RELOAD")),
        ws_max_size=16 << 20,
    )


if __name__ == "__main__":
    main()
