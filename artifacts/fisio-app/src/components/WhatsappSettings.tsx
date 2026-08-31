import { FormEvent, useEffect, useMemo, useState } from "react";
import { clinicApi, WhatsappEventType } from "@/lib/clinicApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BellRing,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  FileText,
  Loader2,
  MessageSquareText,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";

type Template = {
  id: string;
  key: string;
  event_type?: WhatsappEventType;
  eventType?: WhatsappEventType;
  label?: string;
  body?: string;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
};

type WhatsappConfig = {
  enabled?: boolean;
  reminderHours?: number[];
  reminder_hours?: number[];
  timezone?: string;
  instanceName?: string | null;
  connectionStatus?: string;
  connectedPhone?: string | null;
  provider?: string | { configured?: boolean; baseUrlConfigured?: boolean; tokenConfigured?: boolean; instanceName?: string | null; sendPath?: string; status?: string };
  settings?: { enabled?: boolean; reminderHours?: number[]; timezone?: string; instanceName?: string | null; connectionStatus?: string; connectedPhone?: string | null };
  providerStatus?: string;
  provider_status?: string;
  phoneNumber?: string;
  phone_number?: string;
};

type WhatsappInstance = {
  instanceName: string | null;
  status: string;
  phoneNumber: string | null;
  qrCode?: string | null;
  qrExpiresAt?: string | null;
};

type OutboxItem = {
  id: string;
  status?: string;
  event_type?: string;
  eventType?: string;
  created_at?: string;
  createdAt?: string;
  scheduled_for?: string;
  scheduledAt?: string;
  processed_at?: string;
  error?: string;
  lastError?: string;
  last_error?: string;
  nextAttemptAt?: string;
  next_attempt_at?: string;
};

type Client = {
  id: string;
  name?: string;
  full_name?: string;
  first_name?: string;
};

const eventLabels: Record<WhatsappEventType, string> = {
  invite: "Convite para o portal",
  appointment_confirmation: "Confirmação de sessão",
  appointment_reminder: "Lembrete de sessão",
  reschedule: "Pedido de reagendamento",
};

const eventTypes = Object.keys(eventLabels) as WhatsappEventType[];
const reminderOptions = [2, 24, 48, 72];

const getEventType = (template: Template): WhatsappEventType =>
  template.eventType ?? template.event_type ?? "appointment_reminder";

const getClientName = (client: Client) =>
  client.name ?? client.full_name ?? client.first_name ?? "Cliente sem nome";

const formatDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

const qrImageSource = (value?: string | null) => {
  if (!value) return "";
  return value.startsWith("data:image") ? value : `data:image/png;base64,${value}`;
};

const statusLabel = (status?: string) => {
  const labels: Record<string, string> = {
    pending: "Pendente",
    queued: "Na fila",
    processing: "Processando",
    sent: "Enviado",
    delivered: "Entregue",
    failed: "Falhou",
    retry_wait: "Aguardando retry",
    fallback_required: "Fallback necessário",
    cancelled: "Cancelado",
  };
  return labels[status ?? ""] ?? status ?? "Sem status";
};

const statusTone = (status?: string) => {
  if (status === "sent" || status === "delivered") return "border-success/30 bg-success/10 text-success";
  if (status === "failed") return "border-destructive/30 bg-destructive/10 text-destructive";
  if (status === "processing") return "border-primary/30 bg-primary/10 text-primary";
  return "border-warning/30 bg-warning/10 text-warning-foreground";
};

const WhatsappSettings = () => {
  const [config, setConfig] = useState<WhatsappConfig | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [variables, setVariables] = useState<Record<WhatsappEventType, string[]>>({} as Record<WhatsappEventType, string[]>);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [instance, setInstance] = useState<WhatsappInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [openEditor, setOpenEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ templateId?: string; text: string } | null>(null);
  const [testTemplateId, setTestTemplateId] = useState<string | null>(null);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [form, setForm] = useState({
    key: "",
    eventType: "appointment_reminder" as WhatsappEventType,
    label: "",
    body: "",
  });
  const [configForm, setConfigForm] = useState({
    enabled: false,
    reminderHours: [] as number[],
    timezone: "America/Sao_Paulo",
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [configResponse, templatesResponse, outboxResponse, portalResponse] = await Promise.all([
        clinicApi.whatsappConfig(),
        clinicApi.whatsappTemplates(),
        clinicApi.whatsappOutbox(),
        clinicApi.portal(),
      ]);
      const responseConfig = (configResponse ?? {}) as WhatsappConfig;
      const nextConfig = {
        ...((responseConfig.settings ?? {}) as WhatsappConfig),
        provider: responseConfig.provider,
        providerStatus: responseConfig.providerStatus ?? (typeof responseConfig.provider === "object" ? responseConfig.provider.status : undefined),
      } as WhatsappConfig;
      const nextHours = nextConfig.reminderHours ?? nextConfig.reminder_hours ?? [];
      setConfig(nextConfig);
      const provider = typeof nextConfig.provider === "object" ? nextConfig.provider : undefined;
      setInstance({
        instanceName: nextConfig.instanceName ?? nextConfig.settings?.instanceName ?? provider?.instanceName ?? null,
        status: nextConfig.connectionStatus ?? nextConfig.settings?.connectionStatus ?? nextConfig.providerStatus ?? provider?.status ?? "not_configured",
        phoneNumber: nextConfig.connectedPhone ?? nextConfig.settings?.connectedPhone ?? nextConfig.phoneNumber ?? nextConfig.phone_number ?? null,
      });
      setConfigForm({
        enabled: Boolean(nextConfig.enabled),
        reminderHours: nextHours.map(Number).filter((hour) => reminderOptions.includes(hour)),
        timezone: nextConfig.timezone ?? "America/Sao_Paulo",
      });
      setTemplates((templatesResponse?.templates ?? []) as Template[]);
      setVariables((templatesResponse?.variables ?? {}) as Record<WhatsappEventType, string[]>);
      setOutbox((outboxResponse ?? []) as OutboxItem[]);
      setClients(((portalResponse?.clients ?? []) as Client[]).filter((client) => client?.id));
    } catch (loadError: any) {
      setError(loadError?.message || "Não foi possível carregar a operação do WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (instance?.status !== "awaiting_qr") return;
    const timer = window.setInterval(async () => {
      try {
        const result = await clinicApi.whatsappInstanceStatus();
        setInstance((current) => ({
          instanceName: result.instanceName ?? current?.instanceName ?? null,
          status: result.status ?? current?.status ?? "unknown",
          phoneNumber: result.phoneNumber ?? current?.phoneNumber ?? null,
          qrCode: result.status === "awaiting_qr" ? current?.qrCode ?? null : null,
          qrExpiresAt: result.status === "awaiting_qr" ? current?.qrExpiresAt ?? null : null,
        }));
      } catch {
        // The QR may be temporarily unavailable while the provider restarts.
        // Keep the current QR visible and let the user retry explicitly.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [instance?.status]);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === editingId),
    [editingId, templates],
  );

  const startCreate = () => {
    setEditingId(null);
    setForm({ key: "", eventType: "appointment_reminder", label: "", body: "" });
    setPreview(null);
    setOpenEditor(true);
  };

  const startEdit = (template: Template) => {
    setEditingId(template.id);
    setForm({
      key: template.key ?? "",
      eventType: getEventType(template),
      label: template.label ?? "",
      body: template.body ?? "",
    });
    setPreview(null);
    setOpenEditor(true);
  };

  const updateConfig = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("config");
    try {
      await clinicApi.updateWhatsappConfig(configForm);
      await load();
      toast.success("Configuração do WhatsApp atualizada");
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível salvar a configuração");
    } finally {
      setBusy("");
    }
  };

  const saveTemplate = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.key.trim() || !form.label.trim() || !form.body.trim()) {
      toast.error("Preencha a chave, o nome e o texto do template");
      return;
    }
    setBusy("template");
    try {
      if (editingId) {
        await clinicApi.updateWhatsappTemplate(editingId, {
          key: form.key.trim(),
          eventType: form.eventType,
          label: form.label.trim(),
          body: form.body,
        });
        toast.success("Template atualizado");
      } else {
        await clinicApi.createWhatsappTemplate({
          key: form.key.trim(),
          eventType: form.eventType,
          label: form.label.trim(),
          body: form.body,
          active: true,
        });
        toast.success("Template criado");
      }
      setOpenEditor(false);
      await load();
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível salvar o template");
    } finally {
      setBusy("");
    }
  };

  const deactivate = async (template: Template) => {
    if (!window.confirm(`Desativar o template “${template.label ?? template.key}”?`)) return;
    setBusy(`deactivate-${template.id}`);
    try {
      await clinicApi.deactivateWhatsappTemplate(template.id);
      if (editingId === template.id) setOpenEditor(false);
      await load();
      toast.success("Template desativado");
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível desativar o template");
    } finally {
      setBusy("");
    }
  };

  const activate = async (template: Template) => {
    setBusy(`activate-${template.id}`);
    try {
      await clinicApi.updateWhatsappTemplate(template.id, { active: true });
      await load();
      toast.success("Template ativado");
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível ativar o template");
    } finally {
      setBusy("");
    }
  };

  const previewTemplate = async (template: Template) => {
    setBusy(`preview-${template.id}`);
    try {
      const result = await clinicApi.previewWhatsappTemplate({
        eventType: getEventType(template),
        body: template.body ?? "",
      });
      setPreview({ templateId: template.id, text: result.text });
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível gerar a prévia");
    } finally {
      setBusy("");
    }
  };

  const previewDraft = async () => {
    if (!form.body.trim()) {
      toast.error("Escreva o texto antes de visualizar");
      return;
    }
    setBusy("preview-draft");
    try {
      const result = await clinicApi.previewWhatsappTemplate({ eventType: form.eventType, body: form.body });
      setPreview({ text: result.text });
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível gerar a prévia");
    } finally {
      setBusy("");
    }
  };

  const testTemplate = async (template: Template) => {
    if (!selectedClientId) {
      toast.error("Escolha um cliente para o teste controlado");
      return;
    }
    setBusy(`test-${template.id}`);
    try {
      await clinicApi.testWhatsappTemplate(template.id, { clientId: selectedClientId });
      await load();
      setTestTemplateId(null);
      toast.success("Teste enviado para a fila de saída");
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível enviar o teste");
    } finally {
      setBusy("");
    }
  };

  const processOutbox = async (item: OutboxItem) => {
    setBusy(`process-${item.id}`);
    try {
      await clinicApi.processWhatsappOutbox(item.id);
      await load();
      toast.success("Item processado");
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível processar o item");
    } finally {
      setBusy("");
    }
  };

  const connectInstance = async () => {
    setBusy("instance-connect");
    try {
      const result = await clinicApi.connectWhatsappInstance();
      setInstance({
        instanceName: result.instanceName ?? null,
        status: result.status ?? "awaiting_qr",
        phoneNumber: result.phoneNumber ?? null,
        qrCode: result.qrCode ?? null,
        qrExpiresAt: result.qrExpiresAt ?? null,
      });
      await load();
      setInstance((current) => ({
        instanceName: result.instanceName ?? current?.instanceName ?? null,
        status: result.status ?? current?.status ?? "awaiting_qr",
        phoneNumber: result.phoneNumber ?? current?.phoneNumber ?? null,
        qrCode: result.qrCode ?? current?.qrCode ?? null,
        qrExpiresAt: result.qrExpiresAt ?? current?.qrExpiresAt ?? null,
      }));
      toast.success(result.status === "connected" ? "Número conectado" : "QR code gerado");
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível conectar a instância");
    } finally {
      setBusy("");
    }
  };

  const refreshInstanceStatus = async () => {
    setBusy("instance-status");
    try {
      const result = await clinicApi.whatsappInstanceStatus();
      setInstance((current) => ({
        instanceName: result.instanceName ?? current?.instanceName ?? null,
        status: result.status ?? "unknown",
        phoneNumber: result.phoneNumber ?? null,
        qrCode: null,
        qrExpiresAt: null,
      }));
      toast.success("Status atualizado");
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível consultar a instância");
    } finally {
      setBusy("");
    }
  };

  const disconnectInstance = async () => {
    if (!window.confirm("Desconectar o número do WhatsApp desta clínica?")) return;
    setBusy("instance-disconnect");
    try {
      const result = await clinicApi.disconnectWhatsappInstance();
      setInstance({
        instanceName: result.instanceName ?? instance?.instanceName ?? null,
        status: "disconnected",
        phoneNumber: null,
        qrCode: null,
        qrExpiresAt: null,
      });
      await load();
      toast.success("Número desconectado");
    } catch (mutationError: any) {
      toast.error(mutationError?.message || "Não foi possível desconectar o número");
    } finally {
      setBusy("");
    }
  };

  const toggleReminderHour = (hour: number) => {
    setConfigForm((current) => ({
      ...current,
      reminderHours: current.reminderHours.includes(hour)
        ? current.reminderHours.filter((currentHour) => currentHour !== hour)
        : [...current.reminderHours, hour].sort((a, b) => a - b),
    }));
  };

  if (loading) {
    return (
      <section className="space-y-4" aria-label="Carregando WhatsApp">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-28 animate-pulse rounded-sm bg-secondary/70" data-testid={`skeleton-whatsapp-${item}`} />
        ))}
      </section>
    );
  }

  if (error) {
    return (
      <Card className="rounded-sm border-destructive/30 bg-destructive/5" data-testid="error-whatsapp-settings">
        <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold">WhatsApp indisponível</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </div>
          <Button variant="outline" className="rounded-sm gap-2" onClick={load} data-testid="button-retry-whatsapp">
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const providerStatus = instance?.status ?? config?.connectionStatus ?? config?.providerStatus ?? config?.provider_status
    ?? (typeof config?.provider === "object" && config.provider?.configured ? "configured" : "not_configured");
  const providerLabel = typeof config?.provider === "string"
    ? config.provider
    : config?.provider?.configured
      ? `Whatsmiau · ${config.provider.sendPath ?? "/messages"}`
      : "Whatsmiau configurado pelo servidor";
  const providerReady = providerStatus === "connected" || providerStatus === "active" || providerStatus === "ready" || providerStatus === "open";

  return (
    <section className="space-y-5" data-testid="section-whatsapp-settings">
      <div className="flex flex-col gap-3 border-l-2 border-primary pl-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <MessageSquareText className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">Operação segura</p>
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">WhatsApp da clínica</h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            Lembretes claros, consentimento respeitado e uma fila que a equipe consegue acompanhar sem abrir dados clínicos.
          </p>
        </div>
        <Button variant="outline" className="w-fit rounded-sm gap-2" onClick={load} data-testid="button-refresh-whatsapp">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </Button>
      </div>

      <Card className="overflow-hidden rounded-sm border-primary/20 shadow-elevated">
        <CardHeader className="border-b border-border/70 bg-secondary/25 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="rounded-sm bg-primary/10 p-2.5 text-primary"><ShieldCheck className="h-5 w-5" /></div>
              <div>
                <CardTitle className="text-base">Consentimento e provedor</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Ative o envio somente quando o canal e a autorização estiverem prontos.</p>
              </div>
            </div>
            <Badge className={`w-fit rounded-sm border ${configForm.enabled ? "border-success/30 bg-success/10 text-success" : "border-border bg-background text-muted-foreground"}`}>
              {configForm.enabled ? "Automação ativa" : "Automação pausada"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          <form onSubmit={updateConfig} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-sm border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <BellRing className="mt-0.5 h-4 w-4 text-primary" />
                    <div>
                      <Label htmlFor="whatsapp-enabled" className="cursor-pointer text-sm font-semibold">Enviar lembretes</Label>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">O servidor valida consentimento antes de enfileirar qualquer mensagem.</p>
                    </div>
                  </div>
                  <input
                    id="whatsapp-enabled"
                    type="checkbox"
                    checked={configForm.enabled}
                    onChange={(event) => setConfigForm((current) => ({ ...current, enabled: event.target.checked }))}
                    className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                    data-testid="input-whatsapp-enabled"
                  />
                </div>
              </div>
              <div className="rounded-sm border border-border bg-background p-4">
                <div className="flex items-start gap-3">
                  <Smartphone className="mt-0.5 h-4 w-4 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Status do provedor</p>
                    <p className="mt-1 truncate text-sm text-foreground" data-testid="text-whatsapp-provider">
                      {providerLabel}
                    </p>
                    <p className={`mt-1 text-xs ${providerReady ? "text-success" : "text-muted-foreground"}`} data-testid="status-whatsapp-provider">
                       {providerReady ? `Conectado${instance?.phoneNumber ? ` · ${instance.phoneNumber}` : ""} e pronto para operar` : providerStatus === "awaiting_qr" ? "Aguardando leitura do QR code" : providerStatus === "configured" ? "Configurado; conecte um número para começar" : "Whatsmiau ainda não está configurado no servidor"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
              <div className="space-y-2">
                <Label>Antecedência dos lembretes</Label>
                <div className="flex flex-wrap gap-2" data-testid="group-reminder-hours">
                  {reminderOptions.map((hour) => {
                    const selected = configForm.reminderHours.includes(hour);
                    return (
                      <button
                        key={hour}
                        type="button"
                        onClick={() => toggleReminderHour(hour)}
                        className={`flex items-center gap-2 rounded-sm border px-3 py-2 text-sm transition-colors ${selected ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-secondary"}`}
                        data-testid={`button-reminder-hour-${hour}`}
                      >
                        {selected ? <Check className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                        {hour}h antes
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsapp-timezone">Fuso horário</Label>
                <Input id="whatsapp-timezone" value={configForm.timezone} onChange={(event) => setConfigForm((current) => ({ ...current, timezone: event.target.value }))} className="rounded-sm" data-testid="input-whatsapp-timezone" />
              </div>
            </div>
             <div className="rounded-sm border border-border bg-background p-4">
               <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                 <div className="flex gap-3">
                   <Smartphone className="mt-0.5 h-4 w-4 text-primary" />
                   <div>
                     <p className="text-sm font-semibold">Conectar número da clínica</p>
                     <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
                       Gere o QR code, leia com o WhatsApp do número da clínica e aguarde a confirmação da conexão.
                     </p>
                     {instance?.instanceName && <p className="mt-2 font-mono-data text-[11px] text-muted-foreground">instância: {instance.instanceName}</p>}
                   </div>
                 </div>
                 <div className="flex shrink-0 flex-wrap gap-2">
                   <Button type="button" variant="outline" size="sm" className="rounded-sm gap-1.5" onClick={connectInstance} disabled={busy === "instance-connect"} data-testid="button-connect-whatsapp-instance">
                     {busy === "instance-connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Smartphone className="h-3.5 w-3.5" />}
                     {providerReady ? "Novo QR code" : "Conectar por QR"}
                   </Button>
                   {instance?.instanceName && (
                     <Button type="button" variant="outline" size="sm" className="rounded-sm gap-1.5" onClick={refreshInstanceStatus} disabled={busy === "instance-status"} data-testid="button-refresh-whatsapp-instance">
                       {busy === "instance-status" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Status
                     </Button>
                   )}
                   {instance?.status === "connected" && (
                     <Button type="button" variant="ghost" size="sm" className="rounded-sm gap-1.5 text-destructive hover:text-destructive" onClick={disconnectInstance} disabled={busy === "instance-disconnect"} data-testid="button-disconnect-whatsapp-instance">
                       {busy === "instance-disconnect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Desconectar
                     </Button>
                   )}
                 </div>
               </div>
               {instance?.qrCode && (
                 <div className="mt-4 flex flex-col items-center gap-3 rounded-sm border border-primary/20 bg-primary/5 p-4 text-center">
                   <img src={qrImageSource(instance.qrCode)} alt="QR code para conectar o WhatsApp da clínica" className="h-56 w-56 rounded-sm bg-white p-2" data-testid="img-whatsapp-qr-code" />
                   <div>
                     <p className="text-sm font-semibold">Leia este QR code no WhatsApp</p>
                     <p className="mt-1 text-xs text-muted-foreground">Abra Dispositivos conectados → Conectar dispositivo. O código expira em aproximadamente 2 minutos.</p>
                   </div>
                 </div>
               )}
             </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy === "config"} className="rounded-sm gap-2" data-testid="button-save-whatsapp-config">
                {busy === "config" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Salvar configuração
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-sm shadow-elevated">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <div className="rounded-sm bg-primary/10 p-2.5 text-primary"><FileText className="h-5 w-5" /></div>
              <div>
                <CardTitle className="text-base">Templates de mensagem</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Textos aprovados por evento. Variáveis são resolvidas no servidor.</p>
              </div>
            </div>
            <Button onClick={startCreate} className="w-fit rounded-sm gap-2" data-testid="button-new-whatsapp-template">
              <Plus className="h-4 w-4" /> Novo template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 sm:p-5">
          {templates.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border bg-secondary/20 px-5 py-8 text-center" data-testid="empty-whatsapp-templates">
              <FileText className="mx-auto h-7 w-7 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-semibold">Nenhum template cadastrado</p>
              <p className="mt-1 text-sm text-muted-foreground">Crie o primeiro texto para começar a operar com segurança.</p>
            </div>
          ) : templates.map((template) => {
            const eventType = getEventType(template);
            const isTesting = testTemplateId === template.id;
            return (
              <div key={template.id} className={`rounded-sm border p-4 ${template.active === false ? "border-border/60 bg-secondary/20 opacity-70" : "border-border bg-background"}`} data-testid={`card-whatsapp-template-${template.id}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold" data-testid={`text-whatsapp-template-label-${template.id}`}>{template.label ?? template.key}</p>
                      <Badge variant="outline" className="rounded-sm text-[10px]">{template.active === false ? "Inativo" : "Ativo"}</Badge>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-primary">{eventLabels[eventType] ?? eventType}</p>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{template.body || "Sem texto"}</p>
                    <p className="mt-3 font-mono-data text-[11px] text-muted-foreground/80">chave: {template.key}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[230px] sm:justify-end">
                    <Button variant="outline" size="sm" className="rounded-sm gap-1.5" onClick={() => previewTemplate(template)} disabled={busy === `preview-${template.id}`} data-testid={`button-preview-whatsapp-template-${template.id}`}>
                      {busy === `preview-${template.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Prévia
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-sm gap-1.5" onClick={() => startEdit(template)} data-testid={`button-edit-whatsapp-template-${template.id}`}>
                      <Pencil className="h-3.5 w-3.5" /> Editar
                    </Button>
                    {template.active !== false && (
                      <Button variant="ghost" size="sm" className="rounded-sm gap-1.5 text-destructive hover:text-destructive" onClick={() => deactivate(template)} disabled={busy === `deactivate-${template.id}`} data-testid={`button-deactivate-whatsapp-template-${template.id}`}>
                        {busy === `deactivate-${template.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Desativar
                      </Button>
                    )}
                    {template.active === false && (
                      <Button variant="outline" size="sm" className="rounded-sm gap-1.5" onClick={() => activate(template)} disabled={busy === `activate-${template.id}`}>
                        {busy === `activate-${template.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Ativar
                      </Button>
                    )}
                  </div>
                </div>
                {preview?.templateId === template.id && (
                  <div className="mt-4 rounded-sm border border-primary/20 bg-primary/5 p-4" data-testid={`preview-whatsapp-template-${template.id}`}>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Prévia processada pelo servidor</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{preview.text}</p>
                  </div>
                )}
                {template.active !== false && (
                  <div className="mt-4 border-t border-border/70 pt-3">
                    {!isTesting ? (
                      <Button variant="ghost" size="sm" className="rounded-sm gap-1.5 px-0 text-primary hover:bg-transparent hover:text-primary" onClick={() => setTestTemplateId(template.id)} data-testid={`button-open-test-whatsapp-template-${template.id}`}>
                        <Send className="h-3.5 w-3.5" /> Enviar teste controlado
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1 space-y-2">
                          <Label htmlFor={`test-client-${template.id}`}>Cliente de teste</Label>
                          {clients.length > 0 ? (
                            <select id={`test-client-${template.id}`} value={selectedClientId} onChange={(event) => setSelectedClientId(event.target.value)} className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid={`select-test-client-${template.id}`}>
                              <option value="">Selecione um cliente autorizado</option>
                              {clients.map((client) => <option key={client.id} value={client.id}>{getClientName(client)}</option>)}
                            </select>
                          ) : <p className="rounded-sm border border-dashed border-border p-2.5 text-xs text-muted-foreground" data-testid="empty-whatsapp-test-clients">Nenhum cliente disponível para teste controlado.</p>}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" className="rounded-sm" onClick={() => setTestTemplateId(null)} data-testid={`button-cancel-test-whatsapp-template-${template.id}`}><X className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" className="rounded-sm gap-1.5" onClick={() => testTemplate(template)} disabled={!selectedClientId || busy === `test-${template.id}`} data-testid={`button-send-test-whatsapp-template-${template.id}`}>
                            {busy === `test-${template.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Enviar
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {openEditor && (
        <Card className="rounded-sm border-primary/30 shadow-elevated" data-testid="card-whatsapp-template-editor">
          <CardHeader className="border-b border-border/70 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">{activeTemplate ? "Editar template" : "Novo template"}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Use apenas informações operacionais. O servidor faz a substituição das variáveis.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOpenEditor(false)} data-testid="button-close-whatsapp-template-editor"><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={saveTemplate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="template-key">Chave interna</Label>
                  <Input id="template-key" value={form.key} onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))} placeholder="lembrete_24h" className="rounded-sm font-mono-data" required data-testid="input-whatsapp-template-key" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-event">Evento</Label>
                  <select id="template-event" value={form.eventType} onChange={(event) => setForm((current) => ({ ...current, eventType: event.target.value as WhatsappEventType }))} className="h-10 w-full rounded-sm border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="select-whatsapp-template-event">
                    {eventTypes.map((eventType) => <option key={eventType} value={eventType}>{eventLabels[eventType]}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template-label">Nome visível</Label>
                <Input id="template-label" value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="Lembrete de sessão — 24 horas" className="rounded-sm" required data-testid="input-whatsapp-template-label" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="template-body">Texto da mensagem</Label>
                  <span className="text-xs text-muted-foreground">{form.body.length} caracteres</span>
                </div>
                <textarea id="template-body" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Olá, {{client_name}}. Lembramos da sua sessão..." rows={6} className="w-full resize-y rounded-sm border border-input bg-background px-3 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" required data-testid="textarea-whatsapp-template-body" />
                <div className="flex flex-wrap gap-1.5">
                  {(variables[form.eventType] ?? []).map((variable) => (
                    <button key={variable} type="button" onClick={() => setForm((current) => ({ ...current, body: `${current.body}${current.body && !current.body.endsWith(" ") ? " " : ""}{{${variable}}}` }))} className="rounded-sm border border-border bg-secondary/50 px-2 py-1 font-mono-data text-[11px] text-muted-foreground hover:bg-secondary" data-testid={`button-insert-whatsapp-variable-${variable}`}>
                      {`{{${variable}}}`}
                    </button>
                  ))}
                </div>
              </div>
              {preview && !preview.templateId && (
                <div className="rounded-sm border border-primary/20 bg-primary/5 p-4" data-testid="preview-whatsapp-template-draft">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Prévia processada pelo servidor</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{preview.text}</p>
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" className="rounded-sm gap-2" onClick={previewDraft} disabled={busy === "preview-draft"} data-testid="button-preview-whatsapp-template-draft">
                  {busy === "preview-draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />} Visualizar prévia
                </Button>
                <Button type="submit" className="rounded-sm gap-2" disabled={busy === "template"} data-testid="button-save-whatsapp-template">
                  {busy === "template" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar template
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="rounded-sm shadow-elevated">
        <CardHeader className="border-b border-border/70 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="rounded-sm bg-secondary p-2.5 text-primary"><Clock3 className="h-5 w-5" /></div>
              <div>
                <CardTitle className="text-base">Outbox de mensagens</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Acompanhe somente estado de envio, sem conteúdo clínico.</p>
              </div>
            </div>
            <Badge variant="outline" className="rounded-sm">{outbox.length} {outbox.length === 1 ? "item" : "itens"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {outbox.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border bg-secondary/20 px-5 py-8 text-center" data-testid="empty-whatsapp-outbox">
              <Send className="mx-auto h-7 w-7 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-semibold">A fila está vazia</p>
              <p className="mt-1 text-sm text-muted-foreground">Novos envios aparecerão aqui quando o servidor os enfileirar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {outbox.map((item, index) => {
                const status = item.status ?? "pending";
                const itemEventType = item.eventType ?? item.event_type;
                const canProcess = status === "pending" || status === "queued" || status === "retry_wait";
                return (
                  <div key={item.id} className="flex flex-col gap-3 rounded-sm border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`row-whatsapp-outbox-${item.id}`}>
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="font-mono-data pt-0.5 text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{itemEventType ? (eventLabels[itemEventType as WhatsappEventType] ?? itemEventType) : "Mensagem operacional"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">Criado em {formatDate(item.createdAt ?? item.created_at)}{(item.scheduledAt ?? item.scheduled_for) ? ` · agendado para ${formatDate(item.scheduledAt ?? item.scheduled_for)}` : ""}</p>
                        {(item.error ?? item.lastError ?? item.last_error) && <p className="mt-1 text-xs text-destructive">{item.error ?? item.lastError ?? item.last_error}</p>}
                        {(item.nextAttemptAt ?? item.next_attempt_at) && status === "retry_wait" && <p className="mt-1 text-xs text-muted-foreground">Próxima tentativa: {formatDate(item.nextAttemptAt ?? item.next_attempt_at)}</p>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <Badge className={`rounded-sm border ${statusTone(status)}`} data-testid={`status-whatsapp-outbox-${item.id}`}>{statusLabel(status)}</Badge>
                      {canProcess && <Button variant="outline" size="sm" className="rounded-sm gap-1.5" onClick={() => processOutbox(item)} disabled={busy === `process-${item.id}`} data-testid={`button-process-whatsapp-outbox-${item.id}`}>
                        {busy === `process-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Processar
                      </Button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};

export default WhatsappSettings;