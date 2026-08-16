import { initAuthCreds, BufferJSON, type AuthenticationState } from "@whiskeysockets/baileys";
import { IntegrationProvider } from "@prisma/client";
import { withTenant } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

type StoredSessionData = {
  creds: AuthenticationState["creds"];
  keys: Record<string, Record<string, unknown>>;
};

/**
 * مخزن اعتماد Baileys مدعوم بقاعدة البيانات بدل `useMultiFileAuthState` الافتراضي (يكتب على القرص
 * المحلي — لا ينجو من إعادة نشر/تشغيل نظيف لعملية `npm run worker`، ولا يُخزَّن مشفَّراً). كل حالة
 * الاعتماد (creds + مفاتيح الإشارة) تُسلسَل ككائن JSON واحد عبر BufferJSON الخاصة بـBaileys (تحافظ
 * على قيم Buffer/Uint8Array)، ثم تُشفَّر بـ`encryptSecret` الموجودة أصلاً في lib/crypto.ts.
 */
export async function useTenantAuthState(
  tenantId: string
): Promise<{ state: AuthenticationState; saveState: () => Promise<void> }> {
  const integration = await withTenant(tenantId, (tx) =>
    tx.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: IntegrationProvider.WHATSAPP_QR } } })
  );

  let stored: StoredSessionData | null = null;
  if (integration?.encryptedSessionData) {
    stored = JSON.parse(decryptSecret(integration.encryptedSessionData), BufferJSON.reviver) as StoredSessionData;
  }

  const creds = stored?.creds ?? initAuthCreds();
  const keysData: Record<string, Record<string, unknown>> = stored?.keys ?? {};

  async function persist(): Promise<void> {
    const payload: StoredSessionData = { creds, keys: keysData };
    const serialized = encryptSecret(JSON.stringify(payload, BufferJSON.replacer));
    await withTenant(tenantId, (tx) =>
      tx.integration.upsert({
        where: { tenantId_provider: { tenantId, provider: IntegrationProvider.WHATSAPP_QR } },
        update: { encryptedSessionData: serialized },
        create: {
          tenantId,
          provider: IntegrationProvider.WHATSAPP_QR,
          status: "DISCONNECTED",
          isSandbox: false,
          encryptedSessionData: serialized,
        },
      })
    );
  }

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const category = keysData[type] ?? {};
        const result: Record<string, unknown> = {};
        for (const id of ids) {
          if (category[id] !== undefined) result[id] = category[id];
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return result as any;
      },
      set: async (data) => {
        for (const category of Object.keys(data)) {
          keysData[category] ??= {};
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const catData = (data as any)[category] as Record<string, unknown>;
          for (const id of Object.keys(catData)) {
            const value = catData[id];
            if (value) keysData[category][id] = value;
            else delete keysData[category][id];
          }
        }
        await persist();
      },
    },
  };

  return { state, saveState: persist };
}
