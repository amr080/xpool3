import { ApolloClient } from 'apollo-client';
import { Loan } from '../tinlake';
import { InMemoryCache, NormalizedCacheObject } from 'apollo-cache-inmemory';
import { createHttpLink } from 'apollo-link-http';
import config from '../../config';
import fetch from 'node-fetch';
import gql from 'graphql-tag';
import BN from 'bn.js';

const { tinlakeDataBackendUrl } = config;
const cache = new InMemoryCache();
const link = new createHttpLink({
  fetch,
  uri: tinlakeDataBackendUrl
});

export interface TinlakeEventEntry {
  timestamp: string;
  total_debt: string;
  total_value_of_nfts: string;
}

class Apollo {
  client: ApolloClient<NormalizedCacheObject>;
  constructor() {
    this.client =  new ApolloClient({
      cache,
      link
    });
  }

  async getLoans(root: string) {
    let result;
    try {
      result = await this.client
      .query({
        query: gql`
        {
            loans (filter: {
                pool: { id: "${root}"}
            })
            {
              id
              pool {
                id
              }
              index
              owner
              opened
              closed
              debt
              interestRatePerSecond
              ceiling
              threshold
              borrowsCount
              borrowsAggregatedAmount
              repaysCount
              repaysAggregatedAmount
              nftId
              nftRegistry
            }
          }
        `
      });
    } catch (err) {
      console.log(`error occured while fetching time series data from apollo ${err}`);
      return [];
    }
    //console.log("loans received", loans)
    const tinlakeLoans = toTinlakeLoans(result.data.loans);
    return tinlakeLoans;
  }
}

function toTinlakeLoans(loans: Array<any>) : {data: Array<Loan>} {
    const tinlakeLoans : Array<Loan> = [];
    loans.forEach((loan) => {
        const tinlakeLoan = {
            loanId: loan.index,
            registry: loan.nftRegistry,
            tokenId: loan.nftId,
            principal: loan.ceiling ? new BN(loan.ceiling) : new BN(0),
            ownerOf: loan.owner,
            interestRate: loan.interestRatePerSecond ? new BN(loan.interestRatePerSecond) : new BN(0),
            debt: new BN(loan.debt),
            threshold: loan.threshold ? new BN(loan.threshold) : new BN(0),
            price: loan.price || new BN(0),
            status: getLoanStatus(loan)
        }
        tinlakeLoans.push(tinlakeLoan);
    })
    return {data: tinlakeLoans};
}

function getLoanStatus(loan: any) {
    if (loan.closed) {
        return "closed";
    }
    else if (loan.debt && loan.debt !== "0") {
        return "ongoing";
    }
    return "opened";
}


export default new Apollo();