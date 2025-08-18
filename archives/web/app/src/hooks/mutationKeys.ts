import { MutationKey } from '@tanstack/react-query'

function formMutationKeyFn(baseEntity: string) {
  return function mutationKeyFn(additionalKeys: MutationKey = []) {
    return [{ ...mutationKeys.all, baseEntity }, ...additionalKeys]
  }
}

export const mutationKeys = {
  all: { baseScope: 'nuwa' },
  transfer: formMutationKeyFn('transfer'),
  initUser: formMutationKeyFn('initUser'),
  updateUser: formMutationKeyFn('updateUser'),
  updateAgent: formMutationKeyFn('updateAgent'),
  createAgent: formMutationKeyFn('create_agent'),
  updateAgentTask: formMutationKeyFn('update_gent_task'),
  updateAgentTemperature: formMutationKeyFn('update_agent_temperature'),
  joinChannel: formMutationKeyFn('join_channel'),
  snedChannelMessage: formMutationKeyFn('send_channel_message'),
}
