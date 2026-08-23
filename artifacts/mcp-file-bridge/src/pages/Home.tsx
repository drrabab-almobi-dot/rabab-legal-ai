import { useHealthz } from '@/lib/api';
import { 
  ShieldCheck, 
  Activity, 
  Lock, 
  Eye, 
  Database, 
  FileCode2, 
  FolderLock,
  Key,
  Box,
  Fingerprint,
  RefreshCw,
  Server
} from 'lucide-react';

export default function Home() {
  const { data, isLoading, isError } = useHealthz();

  const isOnline = !isLoading && !isError && data;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-8 relative overflow-hidden bg-background">
      {/* Decorative background pattern */}
      <div className="absolute inset-0 status-grid-pattern pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/10 via-primary to-primary/10" />

      <main className="w-full max-w-3xl z-10 space-y-6">
        {/* Header Section */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary font-mono text-sm tracking-tight mb-2">
              <Server className="w-4 h-4" />
              <span>SYSTEM_INTERFACE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-card-foreground">
              Project Files MCP Bridge
            </h1>
            <p className="text-muted-foreground text-sm max-w-lg leading-relaxed">
              Secure operations-facing companion for an authenticated Claude connection. 
              This bridge operates strictly within an explicit project allowlist.
            </p>
          </div>
          
          <div className="flex flex-col sm:items-end justify-end gap-2">
            <div className="bg-card border border-card-border rounded-md px-3 py-2 flex items-center gap-3 shadow-sm">
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 text-muted-foreground animate-spin" />
                  <span className="text-sm font-mono text-muted-foreground">CHECKING_STATUS</span>
                </>
              ) : isError ? (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-destructive animate-pulse" />
                  <span className="text-sm font-mono text-destructive">OFFLINE</span>
                </>
              ) : (
                <>
                  <div className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse shadow-[0_0_8px_hsl(var(--accent))]" />
                  <span className="text-sm font-mono text-card-foreground">ONLINE</span>
                </>
              )}
            </div>
            {!isLoading && !isError && data && (
              <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest">
                Uptime: {data.uptime ? `${Math.floor(data.uptime)}s` : 'N/A'}
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Operational Constraints */}
          <section className="space-y-4">
            <h2 className="text-sm font-mono font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Operational Parameters
            </h2>
            <div className="space-y-3">
              <div className="bg-card border border-card-border p-4 rounded-lg shadow-sm flex gap-4">
                <div className="mt-0.5">
                  <Eye className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground text-sm">Strictly Read-Only</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    The bridge maintains a zero-mutation policy. No write, delete, or execution command affordances are provided or permitted.
                  </p>
                </div>
              </div>
              <div className="bg-card border border-card-border p-4 rounded-lg shadow-sm flex gap-4">
                <div className="mt-0.5">
                  <Fingerprint className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-card-foreground text-sm">Authenticated Access</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    All operations require a secure, mutually authenticated connection. Requests lacking verifiable credentials are dropped.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Hard Exclusions */}
          <section className="space-y-4">
            <h2 className="text-sm font-mono font-medium text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Hard Exclusions
            </h2>
            <div className="bg-card border border-card-border rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border bg-muted/30">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The following paths and categories are explicitly excluded from the bridge's visibility. Any attempt to access them will return a secure null state.
                </p>
              </div>
              <ul className="divide-y divide-border">
                {[
                  { icon: Key, label: 'Secrets & Credentials', desc: '.env, keys, tokens' },
                  { icon: Lock, label: 'Session Data', desc: 'Auth state, cookies' },
                  { icon: Database, label: 'Databases', desc: 'SQLite, dumps, clusters' },
                  { icon: Box, label: 'Dependencies', desc: 'node_modules, vendor' },
                  { icon: FileCode2, label: 'Generated Files', desc: 'Build outputs, dist, caches' }
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 p-3 text-sm hover:bg-muted/30 transition-colors">
                    <div className="flex-shrink-0 w-8 h-8 rounded bg-muted flex items-center justify-center">
                      <item.icon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="font-medium text-card-foreground">{item.label}</div>
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">{item.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* Footer */}
        <footer className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <FolderLock className="w-4 h-4" />
            <span>ENFORCING_PROJECT_ALLOWLIST</span>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
            ID: {Math.random().toString(36).substring(2, 10).toUpperCase()} // SYS_OK
          </div>
        </footer>
      </main>
    </div>
  );
}
