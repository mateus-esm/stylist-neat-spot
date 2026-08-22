import { createClient } from "@supabase/supabase-js";
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const missingConfigurationMessage =
  "O backend ainda não foi configurado neste ambiente.";

const emptyQuery = () => {
  const query: any = {
    select: () => query,
    insert: () => query,
    update: () => query,
    delete: () => query,
    eq: () => query,
    neq: () => query,
    gte: () => query,
    lte: () => query,
    gt: () => query,
    lt: () => query,
    in: () => query,
    is: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return query;
};

const createLocalFallback = () => {
  const channel = {
    on: () => channel,
    subscribe: () => channel,
  };

  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({
        error: new Error(missingConfigurationMessage),
      }),
      signUp: async () => ({
        error: new Error(missingConfigurationMessage),
      }),
      updateUser: async () => ({
        error: new Error(missingConfigurationMessage),
      }),
      setSession: async () => ({
        error: new Error(missingConfigurationMessage),
      }),
    },
    from: () => emptyQuery(),
    storage: {
      from: () => ({
        upload: async () => ({
          error: new Error(missingConfigurationMessage),
        }),
        remove: async () => ({
          error: new Error(missingConfigurationMessage),
        }),
        createSignedUrl: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "" } }),
      }),
    },
    functions: {
      invoke: async () => ({
        data: null,
        error: new Error(missingConfigurationMessage),
      }),
    },
    channel: () => channel,
    removeChannel: () => undefined,
  };
};

export const supabase: any =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          storage: localStorage,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : createLocalFallback();