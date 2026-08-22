import {
  listClinicRecords,
  createClinicRecord,
  updateClinicRecord,
  deleteClinicRecord,
  inviteClinicPatient,
} from "@workspace/api-client-react";

interface SelectOpts {
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
}

class CompatibilityQueryBuilder {
  state: {
    table: string;
    select?: string;
    selectOpts?: SelectOpts;
    order?: string;
    filters: string[];
    limit?: number;
    single?: boolean;
    maybeSingle?: boolean;
    action?: "select" | "update" | "delete";
    updateData?: unknown;
  };

  constructor(table: string) {
    this.state = { table, filters: [], action: "select" };
  }

  select(columns: string = "*", opts?: SelectOpts) {
    this.state.select = columns;
    if (opts) this.state.selectOpts = opts;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.filters.push(`${column}:eq:${value}`);
    return this;
  }

  neq(column: string, value: unknown) {
    this.state.filters.push(`${column}:neq:${value}`);
    return this;
  }

  ilike(column: string, value: unknown) {
    this.state.filters.push(`${column}:ilike:${value}`);
    return this;
  }

  gte(column: string, value: unknown) {
    this.state.filters.push(`${column}:gte:${value}`);
    return this;
  }

  lte(column: string, value: unknown) {
    this.state.filters.push(`${column}:lte:${value}`);
    return this;
  }

  in(column: string, values: unknown[]) {
    // Encode array as pipe-separated values (pipes are safe for date/string DB values)
    this.state.filters.push(`${column}:in:${values.join("|")}`);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    const direction = opts?.ascending === false ? `-${column}` : column;
    if (this.state.order) {
      this.state.order += `,${direction}`;
    } else {
      this.state.order = direction;
    }
    return this;
  }

  limit(n: number) {
    this.state.limit = n;
    return this;
  }

  single() {
    this.state.single = true;
    return this;
  }

  maybeSingle() {
    this.state.maybeSingle = true;
    return this;
  }

  // To allow awaiting the query builder itself
  async then(resolve: (value: unknown) => void, _reject?: (reason: unknown) => void) {
    try {
      const isHead = this.state.selectOpts?.head === true;
      const wantCount = !!this.state.selectOpts?.count;

      // Build filters string — do NOT append single:true for head/count queries
      let filtersStr = this.state.filters.join(",");
      if (this.state.limit) filtersStr += (filtersStr ? "," : "") + `limit:${this.state.limit}`;
      if (!isHead && (this.state.single || this.state.maybeSingle)) {
        filtersStr += (filtersStr ? "," : "") + `single:true`;
      }

      const params: { filters?: string; order?: string } = {};
      if (filtersStr) params.filters = filtersStr;
      if (this.state.order) params.order = this.state.order;

      if (this.state.action === "update") {
        const idFilter = this.state.filters.find(f => f.startsWith("id:eq:"));
        if (idFilter && this.state.filters.length === 1) {
          const id = idFilter.split(":")[2];
          const result = await updateClinicRecord(this.state.table as Parameters<typeof updateClinicRecord>[0], id, this.state.updateData as Record<string, unknown>);
          resolve({ data: result, error: null });
          return;
        }
        const records = await listClinicRecords(this.state.table as Parameters<typeof listClinicRecords>[0], params);
        const updated = [];
        if (Array.isArray(records)) {
          for (const r of records) {
            const res = await updateClinicRecord(this.state.table as Parameters<typeof updateClinicRecord>[0], r.id as string, this.state.updateData as Record<string, unknown>);
            updated.push(res);
          }
        }
        resolve({ data: updated, error: null });
        return;
      }

      if (this.state.action === "delete") {
        const idFilter = this.state.filters.find(f => f.startsWith("id:eq:"));
        if (idFilter && this.state.filters.length === 1) {
          const id = idFilter.split(":")[2];
          await deleteClinicRecord(this.state.table as Parameters<typeof deleteClinicRecord>[0], id);
          resolve({ data: null, error: null });
          return;
        }
        const records = await listClinicRecords(this.state.table as Parameters<typeof listClinicRecords>[0], params);
        if (Array.isArray(records)) {
          for (const r of records) {
            await deleteClinicRecord(this.state.table as Parameters<typeof deleteClinicRecord>[0], r.id as string);
          }
        }
        resolve({ data: null, error: null });
        return;
      }

      // SELECT action
      const result = await listClinicRecords(this.state.table as Parameters<typeof listClinicRecords>[0], params);

      // head: true — count-only mode; callers destructure { count } not { data }
      if (isHead && wantCount) {
        const count = Array.isArray(result) ? result.length : 0;
        resolve({ data: null, count, error: null });
        return;
      }

      let data: unknown = result;
      if (this.state.single || this.state.maybeSingle) {
        if (Array.isArray(result)) {
          data = result.length > 0 ? result[0] : null;
        }
      }

      resolve({ data, error: null });
    } catch (error) {
      console.error(`Error in compatibility client fetch for ${this.state.table}:`, error);
      resolve({ data: null, error });
    }
  }

  insert(data: unknown) {
    const table = this.state.table;
    const chainable = {
      _single: false as boolean,
      select(_cols?: string) { return chainable; },
      single() {
        chainable._single = true;
        return chainable;
      },
      then(resolve: (value: unknown) => void, _reject?: (reason: unknown) => void) {
        (async () => {
          try {
            if (Array.isArray(data)) {
              const results = [];
              for (const item of data) {
                const res = await createClinicRecord(table as Parameters<typeof createClinicRecord>[0], item as Record<string, unknown>);
                results.push(res);
              }
              resolve({ data: chainable._single ? results[0] : results, error: null });
            } else {
              const result = await createClinicRecord(table as Parameters<typeof createClinicRecord>[0], data as Record<string, unknown>);
              resolve({ data: chainable._single ? result : [result], error: null });
            }
          } catch (error) {
            resolve({ data: null, error });
          }
        })();
      }
    };
    return chainable;
  }

  update(data: unknown) {
    this.state.updateData = data;
    this.state.action = "update";
    return this;
  }

  delete() {
    this.state.action = "delete";
    return this;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase: any = {
  from: (table: string) => new CompatibilityQueryBuilder(table),
  functions: {
    invoke: async (fn: string, args: { body?: Record<string, unknown> }) => {
      if (fn === "invite-patient") {
        try {
          const res = await inviteClinicPatient({
            clientId: args.body?.client_id as string,
            email: args.body?.email as string,
          });
          return { data: res, error: null };
        } catch (error) {
          return { data: null, error };
        }
      }
      return { data: null, error: new Error(`Function ${fn} not mapped`) };
    },
  },
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, file: File | Blob, options?: { upsert?: boolean; contentType?: string }) => {
        try {
          const f = file as File & { name?: string; size?: number; type?: string };
          const metadata = {
            name: f?.name || path.split("/").pop() || "upload",
            size: f?.size || 0,
            contentType: options?.contentType || f?.type || "application/octet-stream",
          };
          const request = await fetch("/api/storage/uploads/request-url", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(metadata),
          });
          if (!request.ok) throw new Error("Não foi possível preparar o upload.");

          const { uploadURL, objectPath } = await request.json() as { uploadURL: string; objectPath: string };
          const upload = await fetch(uploadURL, {
            method: "PUT",
            headers: { "Content-Type": metadata.contentType },
            body: file,
          });
          if (!upload.ok) throw new Error("Não foi possível enviar o arquivo.");
          return { data: { path: objectPath as string }, error: null };
        } catch (error) {
          return { data: null, error: error as Error };
        }
      },
      remove: async (paths: string[]) => {
        try {
          for (const path of paths) {
            let target = path;
            // Strip any /api/storage prefix so we work with the raw object path.
            if (target.startsWith("/api/storage")) {
              target = target.slice("/api/storage".length);
            }
            // Ensure a leading slash so the prefix checks below are unambiguous.
            if (!target.startsWith("/")) {
              target = `/${target}`;
            }
            // target is now an absolute path like "/objects/uploads/uuid" or
            // "/some/other/path". If it is not already under /objects/, prepend it.
            if (!target.startsWith("/objects/")) {
              target = `/objects${target}`;
            }
            const res = await fetch(`/api/storage${target}`, {
              method: "DELETE",
              credentials: "include"
            });
            if (!res.ok) throw new Error("Falha ao remover mídia");
          }
          return { data: null, error: null };
        } catch (error) {
          return { data: null, error: error as Error };
        }
      },
      createSignedUrl: async (path: string, _expiresIn: number) => {
        let cleanPath = path;
        if (cleanPath.startsWith("/api/storage")) cleanPath = cleanPath.replace("/api/storage", "");
        if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
        return { data: { signedUrl: `/api/storage${cleanPath}` }, error: null };
      },
      getPublicUrl: (path: string) => {
        let cleanPath = path;
        if (cleanPath.startsWith("/api/storage")) cleanPath = cleanPath.replace("/api/storage", "");
        if (!cleanPath.startsWith("/")) cleanPath = "/" + cleanPath;
        return { data: { publicUrl: `/api/storage${cleanPath}` } };
      },
    }),
  },
  auth: {
    // Return dummy implementations just to prevent crashes if something still calls these
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: async () => ({ error: null }),
  },
  channel: (_name: string) => ({
    on: (_event: string, _opts: unknown, _cb: () => void) => ({ subscribe: () => ({} as Record<string, never>) }),
    subscribe: () => ({} as Record<string, never>),
  }),
  removeChannel: (_channel: unknown) => {},
};
