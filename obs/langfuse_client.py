import os
import hashlib
from contextlib import contextmanager
from typing import Optional, Dict, Any, Union
import json

# Global Langfuse client instance
lf = None
_initialized = False

def _initialize_langfuse():
    """Initialize Langfuse client singleton"""
    global lf, _initialized
    
    if _initialized:
        return
    
    _initialized = True
    
    try:
        # Import langfuse only when needed
        from langfuse import Langfuse
        
        # Get credentials from environment
        public_key = os.getenv('LANGFUSE_PUBLIC_KEY')
        secret_key = os.getenv('LANGFUSE_SECRET_KEY')
        host = os.getenv('LANGFUSE_HOST', 'https://cloud.langfuse.com')
        
        if public_key and secret_key:
            lf = Langfuse(
                public_key=public_key,
                secret_key=secret_key,
                host=host
            )
            print(f"Langfuse initialized with host: {host}")
        else:
            print("Langfuse credentials not found in environment, tracing disabled")
            lf = None
    except ImportError:
        print("Langfuse not installed, tracing disabled")
        lf = None
    except Exception as e:
        print(f"Failed to initialize Langfuse: {e}")
        lf = None

def _redact_sensitive_data(data: Any) -> Any:
    """Redact sensitive data for logging"""
    if data is None:
        return data
    
    if isinstance(data, str):
        # Redact long strings (>1k chars)
        if len(data) > 1000:
            hash_val = hashlib.sha256(data.encode()).hexdigest()[:16]
            return f"<REDACTED_STRING hash={hash_val} length={len(data)}>"
        return data
    
    if isinstance(data, dict):
        redacted = {}
        for key, value in data.items():
            # Redact sensitive fields
            if key.lower() in ['description', 'reason', 'q', 'query']:
                if isinstance(value, str):
                    hash_val = hashlib.sha256(value.encode()).hexdigest()[:16]
                    redacted[f"{key}_hash"] = hash_val
                    redacted[f"{key}_length"] = len(value)
                else:
                    redacted[key] = str(value)  # Convert to string for safety
            elif key.lower() == 'vendor_id':
                # Hash vendor ID
                if isinstance(value, str):
                    redacted[f"{key}_hash"] = hashlib.sha256(value.encode()).hexdigest()[:16]
                else:
                    redacted[key] = value
            else:
                redacted[key] = _redact_sensitive_data(value)
        return redacted
    
    if isinstance(data, list):
        return [_redact_sensitive_data(item) for item in data]
    
    return data

def start_trace(operation: str, user_id: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None) -> Optional[Any]:
    """Start a new Langfuse trace"""
    if not _initialized:
        _initialize_langfuse()
    
    if lf is None:
        # Return dummy trace object if Langfuse unavailable
        return DummyTrace(operation)
    
    try:
        # Redact metadata
        safe_metadata = _redact_sensitive_data(metadata) if metadata else {}
        
        trace = lf.trace(
            name=operation,
            user_id=user_id,
            metadata=safe_metadata
        )
        return trace
    except Exception as e:
        print(f"Failed to start trace: {e}")
        return DummyTrace(operation)

@contextmanager
def with_span(trace: Optional[Any], name: str, input_data: Optional[Any] = None, 
              output_data: Optional[Any] = None, metadata: Optional[Dict[str, Any]] = None):
    """Context manager for creating spans with automatic data redaction"""
    
    if trace is None or isinstance(trace, DummyTrace):
        # No-op if tracing disabled
        span_result = {'output': None, 'metadata': {}}
        try:
            yield span_result
        finally:
            pass
        return
    
    try:
        # Redact input and metadata
        safe_input = _redact_sensitive_data(input_data)
        safe_metadata = _redact_sensitive_data(metadata) if metadata else {}
        
        span = trace.span(
            name=name,
            input=safe_input,
            metadata=safe_metadata
        )
        
        span_result = {'output': None, 'metadata': safe_metadata}
        
        try:
            yield span_result
            
            # Redact and set output
            if output_data is not None:
                safe_output = _redact_sensitive_data(output_data)
                span_result['output'] = safe_output
                span.update(output=safe_output)
            elif span_result['output'] is not None:
                safe_output = _redact_sensitive_data(span_result['output'])
                span.update(output=safe_output)
            
            span.end()
            
        except Exception as e:
            # Update span with error info
            span.update(
                output={'error': str(e), 'error_type': type(e).__name__},
                level="ERROR"
            )
            span.end()
            raise
            
    except Exception as e:
        print(f"Span creation failed: {e}")
        # Fallback to no-op
        span_result = {'output': None, 'metadata': {}}
        try:
            yield span_result
        finally:
            pass

def flush_traces():
    """Flush any pending traces (useful for testing)"""
    if lf is not None:
        try:
            lf.flush()
        except Exception as e:
            print(f"Failed to flush traces: {e}")

class DummyTrace:
    """Dummy trace object when Langfuse is unavailable"""
    
    def __init__(self, operation: str):
        self.operation = operation
        self.id = f"dummy_trace_{hash(operation)}_{id(self)}"
    
    def span(self, name: str, **kwargs):
        return DummySpan(name)
    
    def update(self, **kwargs):
        pass
    
    def end(self):
        pass

class DummySpan:
    """Dummy span object when Langfuse is unavailable"""
    
    def __init__(self, name: str):
        self.name = name
        self.id = f"dummy_span_{hash(name)}_{id(self)}"
    
    def update(self, **kwargs):
        pass
    
    def end(self):
        pass

def get_trace_id(trace: Optional[Any]) -> Optional[str]:
    """Extract trace ID for API responses"""
    if trace is None:
        return None
    
    if isinstance(trace, DummyTrace):
        return trace.id
    
    try:
        # Try to get trace ID from Langfuse trace
        if hasattr(trace, 'id'):
            return trace.id
        elif hasattr(trace, 'trace_id'):
            return trace.trace_id
        else:
            return str(id(trace))  # Fallback
    except Exception:
        return None

def is_tracing_enabled() -> bool:
    """Check if tracing is enabled"""
    if not _initialized:
        _initialize_langfuse()
    return lf is not None