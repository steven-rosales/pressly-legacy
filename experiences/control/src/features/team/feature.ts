import { defineExperienceFeature } from "@pressly/cells"

export const controlTeamFeature = defineExperienceFeature({
  id: "control.team",
  uses: [
    "control.list-members.v1",
    "control.get-member.v1",
    "control.list-member-sessions.v1",
    "control.revoke-member-sessions.v1",
    "control.list-invitations.v1",
    "control.issue-invitation.v1",
    "control.reissue-invitation.v1",
    "control.revoke-invitation.v1",
    "control.suspend-membership.v1",
    "control.reactivate-membership.v1",
    "control.end-membership.v1",
    "control.grant-access.v1",
    "control.revoke-access.v1",
    "control.preview-invitation.v1",
    "control.accept-new-invitation.v1",
    "control.accept-existing-invitation.v1",
    "control.accept-existing-invitation-password.v1",
    "control.accept-existing-invitation-mfa.v1",
  ],
  stateProofs: [
    "experiences/control/src/features/team/team-workspace.test.tsx",
    "experiences/control/src/features/team/invitation-acceptance-view.test.tsx",
  ],
  componentProofs: [
    "experiences/control/src/features/team/team-workspace.test.tsx",
    "experiences/control/src/features/team/invitation-acceptance-view.test.tsx",
  ],
})
