import { useMutation } from '@tanstack/react-query';
import { matchContacts } from '../api/users';

export function useMatchContacts() {
  return useMutation({
    mutationFn: (phoneNumbers: string[]) => matchContacts(phoneNumbers),
  });
}
