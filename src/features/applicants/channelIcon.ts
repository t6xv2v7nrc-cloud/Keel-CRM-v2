import type { IconName } from '../../components/ui';
import type { Channel } from '../../lib/contacts';

/** The icon for each way of being in touch with a client. */
export const CHANNEL_ICON: Record<Channel, IconName> = {
  call: 'phone', whatsapp: 'chat', text: 'send', email: 'mail', in_person: 'user', note: 'pencil',
};
