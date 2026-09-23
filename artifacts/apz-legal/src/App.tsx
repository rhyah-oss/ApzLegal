import { Route, Switch, Router as WouterRouter } from 'wouter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from 'next-themes';
import { useGetCurrentUser } from '@workspace/api-client-react';

import LoginPage         from '@/pages/login';
import DashboardPage     from '@/pages/dashboard';
import ClientsPage       from '@/pages/clients/index';
import ClientDetailPage  from '@/pages/clients/[id]';
import MattersPage       from '@/pages/matters/index';
import MatterDetailPage  from '@/pages/matters/[id]';
import DocumentDetailPage from '@/pages/matters/document-detail';
import DocumentsPage     from '@/pages/documents/index';
import AiAssistantPage   from '@/pages/ai/index';
import ResearchPage      from '@/pages/research/index';
import EmailPage         from '@/pages/email/index';
import WorkflowPage      from '@/pages/workflow/index';
import ProductivityPage  from '@/pages/productivity/index';
import TimeTrackingPage  from '@/pages/time/index';
import CalendarPage      from '@/pages/calendar/index';
import TasksPage         from '@/pages/tasks/index';
import TemplatesPage     from '@/pages/templates/index';
import AdminPage         from '@/pages/admin/index';
import AuditPage         from '@/pages/audit/index';
import ConflictsPage     from '@/pages/conflicts/index';
import KnowledgePage     from '@/pages/knowledge/index';
import SettingsPage      from '@/pages/settings/index';
import AppointmentsPage  from '@/pages/appointments/index';
import FicaPage          from '@/pages/fica/index';
import ActionsPage         from '@/pages/actions/index';
import { Layout }        from '@/components/layout/Layout';

import { installPagedFetch } from "@/lib/paged-fetch";
import { installSessionExpiryHandler } from "@/lib/session-expiry";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if (error && typeof error === 'object' && 'status' in error) {
          const status = (error as { status: number }).status;
          if (status === 401 || status === 403) return false;
        }
        return failureCount < 1;
      },
      staleTime: 30_000,
    },
  },
});

installPagedFetch();
installSessionExpiryHandler(() => queryClient.clear());

function LoadingScreen() {
  return (
    <div className="theme-surface flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-5 w-5 rounded-full border border-border border-t-foreground animate-spin" />
        <p className="text-xs text-muted-foreground">Loading workspace…</p>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex h-[80vh] flex-col items-center justify-center space-y-3">
      <p className="text-4xl font-light text-muted-foreground/40">404</p>
      <p className="text-sm text-muted-foreground">Page not found.</p>
    </div>
  );
}

function AuthGate() {
  const { data: user, isLoading } = useGetCurrentUser();

  if (isLoading) return <LoadingScreen />;
  if (!user) return <LoginPage />;

  return (
    <Layout user={user}>
      <Switch>
        <Route path="/"           component={DashboardPage}    />
        <Route path="/actions"    component={ActionsPage}      />
        <Route path="/matters"    component={MattersPage}      />
        <Route path="/matters/:matterId/documents/:id" component={DocumentDetailPage} />
        <Route path="/matters/:id" component={MatterDetailPage} />
        <Route path="/clients"    component={ClientsPage}      />
        <Route path="/clients/:id" component={ClientDetailPage} />
        <Route path="/ai"         component={AiAssistantPage}  />
        <Route path="/research"   component={ResearchPage}     />
        <Route path="/documents"  component={DocumentsPage}    />
        <Route path="/email"      component={EmailPage}        />
        <Route path="/workflow"   component={WorkflowPage}     />
        <Route path="/productivity" component={ProductivityPage} />
        <Route path="/time"       component={TimeTrackingPage} />
        <Route path="/calendar"   component={CalendarPage}     />
        <Route path="/tasks"      component={TasksPage}        />
        <Route path="/templates"  component={TemplatesPage}    />
        <Route path="/admin"      component={AdminPage}        />
        <Route path="/audit"      component={AuditPage}        />
        <Route path="/conflicts"  component={ConflictsPage}    />
        <Route path="/knowledge"  component={KnowledgePage}    />
        <Route path="/settings"      component={SettingsPage}     />
        <Route path="/appointments"  component={AppointmentsPage} />
        <Route path="/fica"          component={FicaPage}         />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="apz-legal-ink-brass-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthGate />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
