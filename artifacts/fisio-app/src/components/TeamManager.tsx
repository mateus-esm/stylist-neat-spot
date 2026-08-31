import { useEffect, useState } from "react";
import { clinicApi } from "@/lib/clinicApi";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useRole";

const TeamManager = () => {
  const { isAdmin } = useRole();
  const [members, setMembers] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"physiotherapist" | "admin">("physiotherapist");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedPhysio, setSelectedPhysio] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [team, portal, currentAssignments, history] = await Promise.all([
        clinicApi.members(), clinicApi.portal(), clinicApi.assignments(), clinicApi.audit(),
      ]);
      setMembers(team); setPatients(portal.clients ?? []); setAppointments(portal.appointments ?? []); setAssignments(currentAssignments); setAudit(history);
    } catch (error: any) { toast.error(error.message || "Não foi possível carregar a equipe"); }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);
  if (!isAdmin) return null;

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true);
    try { const result = await clinicApi.inviteMember({ email, role: inviteRole }); toast.success(`Convite criado. Compartilhe ${result.invitePath}`); setEmail(""); load(); }
    catch (error: any) { toast.error(error.message || "Não foi possível convidar"); }
    finally { setBusy(false); }
  };
  const assign = async () => {
    if (!selectedPatient) return;
    setBusy(true);
    try { await clinicApi.assign({ clientId: selectedPatient, physiotherapistUserId: selectedPhysio && selectedPhysio !== "__none__" ? selectedPhysio : null }); toast.success("Responsável atualizado"); load(); }
    catch (error: any) { toast.error(error.message || "Não foi possível atribuir"); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    try { await clinicApi.updateMember(id, { status: "revoked" }); toast.success("Acesso revogado"); load(); }
    catch (error: any) { toast.error(error.message || "Não foi possível revogar"); }
  };
  const transfer = async () => {
    if (!selectedAppointment || !selectedPhysio || selectedPhysio === "__none__") return;
    setBusy(true);
    try {
      await clinicApi.transferAppointment(selectedAppointment, selectedPhysio);
      toast.success("Sessão transferida"); load();
    } catch (error: any) { toast.error(error.message || "Não foi possível transferir a sessão"); }
    finally { setBusy(false); }
  };

  const physiotherapists = members.filter((member) => member.role === "physiotherapist" && member.status === "active");
  return <section className="space-y-4">
    <div><h2 className="text-xl font-semibold">Equipe e responsabilidades</h2><p className="mt-1 text-sm text-muted-foreground">Convide profissionais e defina quem acompanha cada paciente. O servidor aplica esse limite em todas as telas clínicas.</p></div>
    <Card className="rounded-sm"><CardContent className="p-4"><form onSubmit={invite} className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
      <div className="space-y-2"><Label>E-mail do convite</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="profissional@clinica.com" required className="rounded-sm" /></div>
      <div className="space-y-2"><Label>Papel</Label><Select value={inviteRole} onValueChange={(value: any) => setInviteRole(value)}><SelectTrigger className="rounded-sm"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="physiotherapist">Fisioterapeuta</SelectItem><SelectItem value="admin">Administrador</SelectItem></SelectContent></Select></div>
      <Button disabled={busy} className="rounded-sm gap-2"><UserPlus className="h-4 w-4" /> Convidar</Button>
    </form></CardContent></Card>

    <Card className="rounded-sm"><CardContent className="space-y-3 p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Membros</p>{members.map((member) => <div key={member.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"><div><p className="text-sm font-medium">{member.email || member.user_id}</p><p className="text-xs text-muted-foreground capitalize">{member.role} · {member.status === "active" ? "ativo" : "revogado"}</p></div>{member.status === "active" && member.role !== "owner" && <Button variant="ghost" size="sm" onClick={() => revoke(member.id)} className="gap-1 text-destructive"><UserRoundX className="h-3.5 w-3.5" /> Revogar</Button>}</div>)}</CardContent></Card>

    <Card className="rounded-sm"><CardContent className="space-y-3 p-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Atribuir pacientes</p><p className="text-sm text-muted-foreground">Pacientes sem responsável continuam visíveis para a administração.</p></div><div className="grid gap-3 sm:grid-cols-2"><Select value={selectedPatient} onValueChange={setSelectedPatient}><SelectTrigger className="rounded-sm"><SelectValue placeholder="Paciente" /></SelectTrigger><SelectContent>{patients.map((patient) => <SelectItem key={patient.id} value={patient.id}>{patient.name}</SelectItem>)}</SelectContent></Select><Select value={selectedPhysio} onValueChange={setSelectedPhysio}><SelectTrigger className="rounded-sm"><SelectValue placeholder="Fisioterapeuta (ou sem responsável)" /></SelectTrigger><SelectContent><SelectItem value="__none__">Sem responsável</SelectItem>{physiotherapists.map((member) => <SelectItem key={member.user_id} value={member.user_id}>{member.email || member.user_id}</SelectItem>)}</SelectContent></Select></div><Button onClick={assign} disabled={busy || !selectedPatient} className="w-full rounded-sm gap-2"><UserRoundCheck className="h-4 w-4" /> Salvar atribuição</Button>{assignments.length > 0 && <div className="space-y-1 text-xs text-muted-foreground">{assignments.map((assignment) => <div key={assignment.id} className="flex justify-between"><span>{patients.find((p) => p.id === assignment.client_id)?.name ?? "Paciente"}</span><Badge variant="outline" className="rounded-sm">{assignment.status === "active" ? "Atribuído" : "Sem responsável"}</Badge></div>)}</div>}</CardContent></Card>
    <Card className="rounded-sm"><CardContent className="space-y-3 p-4"><div><p className="text-xs uppercase tracking-wider text-muted-foreground">Transferir sessão</p><p className="text-sm text-muted-foreground">A transferência altera o responsável pela sessão e fica registrada no histórico.</p></div><Select value={selectedAppointment} onValueChange={setSelectedAppointment}><SelectTrigger className="rounded-sm"><SelectValue placeholder="Sessão" /></SelectTrigger><SelectContent>{appointments.map((appointment) => <SelectItem key={appointment.id} value={appointment.id}>{appointment.appointment_date} · {appointment.start_time?.slice(0, 5)}</SelectItem>)}</SelectContent></Select><Button onClick={transfer} disabled={busy || !selectedAppointment || !selectedPhysio || selectedPhysio === "__none__"} className="w-full rounded-sm">Transferir para o fisioterapeuta selecionado</Button></CardContent></Card>
    <Card className="rounded-sm"><CardContent className="space-y-2 p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Histórico de alterações</p>{audit.slice(0, 8).map((event) => <div key={event.id} className="flex justify-between gap-3 text-xs"><span>{event.action}</span><span className="text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</span></div>)}{audit.length === 0 && <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>}</CardContent></Card>
  </section>;
};

export default TeamManager;