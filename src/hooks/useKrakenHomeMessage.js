import { useEffect, useState } from 'react';
import {
  filterTodayScheduledMatches,
  pickKrakenDailyMessage,
} from '../lib/krakenDailyMessages';

export function useKrakenHomeMessage(matches = []) {
  const [message, setMessage] = useState('');

  useEffect(() => {
    const todayMatches = filterTodayScheduledMatches(matches);
    setMessage(pickKrakenDailyMessage(todayMatches));
  }, [matches]);

  return message;
}
