import { MessageSquare } from "lucide-react";

export default function CRM() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">CRM</h1>
      </div>
      <p className="text-muted-foreground">Gerenciamento de contatos e relacionamentos.</p>
    </div>
  );
}
