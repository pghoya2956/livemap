import React from 'react';
import { Ticker, tickerItems } from '@pghoya2956/livemap-ui';
import { data } from '../sample/monitor';

export const FromData = () => <Ticker items={tickerItems(data as any)} />;
