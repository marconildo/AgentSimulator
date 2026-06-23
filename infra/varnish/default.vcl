vcl 4.1;

# 088-network-layer — Varnish as the CDN / edge cache, the browser-facing front
# door of the ingress chain. 090-waf-after-lb: it forwards on to the load balancer
# (HAProxy), which terminates TLS before the WAF inspects the plaintext.
#
# POST /api/chat is dynamic and *uncacheable*, so the CDN never caches it — every
# chat is a BYPASS (a pass-through), not a coincidental cache MISS. The decision is
# announced to the backend via the X-Cache REQUEST header so app/network.py can
# report it honestly (BYPASS for the dynamic API; a static GET could still be a real
# HIT/MISS). Streaming is on so SSE tokens are not buffered.

backend lb {
    .host = "haproxy";
    # HAProxy's ingress frontend binds :8081 (see infra/haproxy/haproxy.cfg).
    .port = "8081";
}

sub vcl_recv {
    # Pass (never cache) anything that isn't a simple cacheable GET/HEAD — the chat
    # API is dynamic. This is a BYPASS, not a cache lookup that missed (recorded below).
    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }
}

sub vcl_backend_fetch {
    # Announce the cache decision to the origin so the backend can report it honestly
    # (read in app/network.py). A non-GET/HEAD is uncacheable → BYPASS (pass-through);
    # a cacheable GET that reaches the backend is a genuine MISS. 091: also stamp the
    # hit count (0 on any origin fetch) and a human REASON so the box explains WHY.
    set bereq.http.X-Cache-Hits = "0";
    if (bereq.method != "GET" && bereq.method != "HEAD") {
        set bereq.http.X-Cache = "BYPASS";
        set bereq.http.X-Cache-Reason = "uncacheable method (" + bereq.method + ")";
    } else {
        set bereq.http.X-Cache = "MISS";
        set bereq.http.X-Cache-Reason = "cacheable, not in cache — fetched from origin";
    }
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
    # CDN signal. obj.hits > 0 ⇒ served from cache (HIT); an uncacheable method is a
    # BYPASS (pass-through); otherwise a genuine MISS.
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
    } else if (req.method != "GET" && req.method != "HEAD") {
        set resp.http.X-Cache = "BYPASS";
    } else {
        set resp.http.X-Cache = "MISS";
    }
    set resp.http.X-Cache-Server = "varnish";
}
