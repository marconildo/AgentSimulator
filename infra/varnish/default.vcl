vcl 4.1;

# 088-network-layer — Varnish as the CDN / edge cache, the browser-facing front
# door of the ingress chain. It forwards on to the WAF (ModSecurity).
#
# POST /api/chat is dynamic and uncacheable, so every chat is a cache MISS that is
# passed straight through (with streaming on, so SSE tokens are not buffered). The
# MISS is announced to the backend via the X-Cache REQUEST header so the backend's
# app/network.py can report it honestly. Static GETs could be cached (HIT); the
# point of the station is to show the HIT/MISS decision, which is real here.

backend waf {
    .host = "modsecurity";
    .port = "80";
}

sub vcl_recv {
    # Pass (never cache) anything that isn't a simple cacheable GET/HEAD — the chat
    # API is dynamic. The pass path still records the MISS below.
    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }
}

sub vcl_backend_fetch {
    # A backend fetch only happens on a cache MISS — announce it to the origin so
    # the backend can report the cache decision honestly (read in app/network.py).
    set bereq.http.X-Cache = "MISS";
    set bereq.http.X-Cache-Server = "varnish";
}

sub vcl_backend_response {
    # Stream the response straight through (don't buffer) so SSE works end to end.
    set beresp.do_stream = true;
    if (bereq.url ~ "^/api/") {
        set beresp.uncacheable = true;
        set beresp.ttl = 0s;
    }
}

sub vcl_deliver {
    # Also expose the cache decision to the browser (response header), the usual
    # CDN signal. obj.hits > 0 ⇒ served from cache (HIT), else MISS.
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
    } else {
        set resp.http.X-Cache = "MISS";
    }
    set resp.http.X-Cache-Server = "varnish";
}
