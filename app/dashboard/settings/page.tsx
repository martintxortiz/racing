"use client";

import { useQuery } from "convex/react";

import AccountAvatar from "@/components/dashboard/account-avatar";
import SettingsRow from "@/components/dashboard/settings/settings-row";
import SettingsSection from "@/components/dashboard/settings/settings-section";
import SettingsShell from "@/components/dashboard/settings/settings-shell";
import { api } from "@/convex/_generated/api";

const AccountSettingsPage = () => {
  const me = useQuery(api.users.me);
  const loading = me === undefined;

  return (
    <SettingsShell>
      <SettingsSection
        title="Account"
        description="Manage your account details and public profile."
      >
        <SettingsRow
          label="Username"
          value={me?.username ? `@${me.username}` : "—"}
          action="Change Username"
          leading={
            <AccountAvatar
              src={me?.image}
              name={me?.username}
              className="size-10 shrink-0"
            />
          }
        />
        <SettingsRow
          label="Email"
          value={me?.email ?? "—"}
          action="Change Email"
        />
        <SettingsRow label="Subscription" value="Free" action="Upgrade" />
        <SettingsRow
          label="Profile visibility"
          value="Public"
          action="Change"
        />
      </SettingsSection>

      <SettingsSection title="Security">
        <SettingsRow
          label="Password Sign In"
          value={me?.hasPassword ? "Reset your password" : "No password set"}
          action={me?.hasPassword ? "Reset Password" : "Enable"}
          variant={loading || me?.hasPassword ? undefined : "white"}
          loading={loading}
        />
        <SettingsRow
          label="Google Sign in"
          value={me?.email ?? "—"}
          variant={loading || me?.hasGoogle ? undefined : "white"}
          action={me?.hasGoogle ? "Disable" : "Enable"}
          loading={loading}
        />
        <SettingsRow
          label="Multi-factor authentication"
          value="Not enabled"
          action="Enable"
          variant="white"
        />
      </SettingsSection>

      <SettingsSection title="Danger">
        <SettingsRow
          label="Delete Account"
          value="Permanently delete your account and all data"
          action="Delete Account"
          variant="danger"
        />
      </SettingsSection>
    </SettingsShell>
  );
};

export default AccountSettingsPage;
