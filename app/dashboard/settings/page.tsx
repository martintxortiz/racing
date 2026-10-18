"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import AvatarEditor from "@/components/dashboard/settings/avatar-editor";
import EditFieldDialog from "@/components/dashboard/settings/edit-field-dialog";
import SettingsRow from "@/components/dashboard/settings/settings-row";
import SettingsSection from "@/components/dashboard/settings/settings-section";
import SettingsShell from "@/components/dashboard/settings/settings-shell";
import UsernameStatus from "@/components/dashboard/settings/username-status";
import { api } from "@/convex/_generated/api";

const AccountSettingsPage = () => {
  const me = useQuery(api.users.me);
  const loading = me === undefined;
  const updateUsername = useMutation(api.users.updateUsername);
  const [usernameDialogOpen, setUsernameDialogOpen] = useState(false);

  return (
    <SettingsShell>
      <SettingsSection
        title="Account"
      >
        <SettingsRow
          label="Username"
          value={me?.username ? `@${me.username}` : "—"}
          action="Change Username"
          onAction={() => setUsernameDialogOpen(true)}
          leading={<AvatarEditor src={me?.image} name={me?.username} />}
        />
        <SettingsRow
          label="Email"
          value={me?.email ?? "—"}
          action="Change Email"
        />
        <SettingsRow
          label="Subscription"
          value="Free"
          action="Upgrade"
          variant={"white"}
        />
        <SettingsRow
          label="Profile visibility"
          value="Public"
          action="Change"
        />
      </SettingsSection>

      <EditFieldDialog
        open={usernameDialogOpen}
        onOpenChange={setUsernameDialogOpen}
        title="Change Username"
        description="Pick a new username for your account."
        label="Username"
        placeholder="New username"
        defaultValue={me?.username ?? ""}
        status={({ value, setSubmittable }) => (
          <UsernameStatus
            value={value}
            currentUsername={me?.username ?? undefined}
            onSubmittableChange={setSubmittable}
          />
        )}
        onSubmit={async (value) => {
          await updateUsername({ username: value });
        }}
      />

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
