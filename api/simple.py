def handler(event, context):
    """Minimal Vercel handler"""
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": '{"ok": true, "message": "Simple handler working"}'
    }