import { LoadingScreen } from "@/components/layout/LoadingScreen";
import useAddressByUsername from "@/hooks/useAddressByUsername";
import useAgentWithAddress from "@/hooks/useAgentWithAddress";
import useUserInfo from "@/hooks/useUserInfo";
import { AgentProfile } from "@/pages/AgentProfile";
import { NotFound } from "@/pages/NotFound";
import { UserProfile } from "@/pages/UserProfile";
import { RoochAddress } from "@roochnetwork/rooch-sdk";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

export function ProfileRouter() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();

  // Check if the identifier is a valid address
  const isAddress = (() => {
    try {
      if (!identifier) return false;
      new RoochAddress(identifier);
      return true;
    } catch {
      return false;
    }
  })();

  // If the identifier is an address, check if it's an agent or user
  const {
    agent,
    isPending: isAgentPending,
    isError: isAgentError,
  } = useAgentWithAddress(isAddress ? identifier : undefined);
  const {
    userInfo,
    isPending: isUserPending,
    isError: isUserError,
  } = useUserInfo(isAddress ? identifier : undefined);

  // If the identifier is a username, try to get the corresponding address
  const {
    address,
    isPending: isAddressPending,
    isError: isAddressError,
  } = useAddressByUsername(!isAddress ? identifier : undefined);

  // Add agent and userInfo queries for username type
  const { agent: usernameAgent, isPending: isUsernameAgentPending } =
    useAgentWithAddress(address || undefined);
  const { userInfo: usernameUserInfo, isPending: isUsernameUserPending } =
    useUserInfo(address || undefined);

  // Redirect logic
  useEffect(() => {
    if (isAddress) {
      if (!isAgentPending && agent?.username) {
        navigate(`/profile/${agent.username}`, { replace: true });
      } else if (!isUserPending && userInfo?.username) {
        navigate(`/profile/${userInfo.username}`, { replace: true });
      }
    }
  }, [agent, userInfo, isAgentPending, isUserPending, navigate, isAddress]);

  if (!identifier) {
    return <NotFound />;
  }

  // Handle address type identifier
  if (isAddress) {
    if (isAgentPending || isUserPending) {
      return <LoadingScreen />;
    }

    if (agent) {
      return (
        <div className="h-screen overflow-auto">
          <AgentProfile address={identifier} />
        </div>
      );
    }

    if (userInfo) {
      return <UserProfile address={identifier} />;
    }

    return <NotFound />;
  }

  // Handle username type identifier
  if (
    isAddressPending ||
    isUserError ||
    isUsernameAgentPending ||
    isUsernameUserPending
  ) {
    return <LoadingScreen />;
  }

  if (isAgentError || isAddressError || !address) {
    return <NotFound />;
  }

  // Display the corresponding Profile based on the address type
  if (usernameAgent) {
    return (
      <div className="h-screen overflow-auto">
        <AgentProfile address={address} />
      </div>
    );
  }

  if (usernameUserInfo) {
    return <UserProfile address={address} />;
  }

  return <NotFound />;
}
