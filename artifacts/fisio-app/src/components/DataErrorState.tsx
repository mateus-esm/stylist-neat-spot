import { Button } from "@/components/ui/button";

interface DataErrorStateProps {
  message?: string;
  onRetry: () => void;
}

const DataErrorState = ({ message, onRetry }: DataErrorStateProps) => (
  <div className="flex min-h-[50vh] items-center justify-center p-6 text-center">
    <div className="max-w-sm space-y-3">
      <h1 className="text-lg font-semibold">Não foi possível carregar os dados</h1>
      <p className="text-sm text-muted-foreground">
        {message || "Verifique sua conexão e tente novamente."}
      </p>
      <Button onClick={onRetry} className="rounded-sm">Tentar novamente</Button>
    </div>
  </div>
);

export default DataErrorState;