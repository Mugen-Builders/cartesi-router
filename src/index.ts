import { hexToString, getAddress } from "viem";
import { Error_out, Log, Notice, Output, Report } from "./outputs";
import { Wallet } from "cartesi-wallet";

class DefaultRoute {
  public execute = (request: any): Output | Set<Output> => {
    return new Error_out("Operation not implemented");
  };
}

class AdvanceRoute extends DefaultRoute {
  msg_sender!: string;
  msg_timestamp!: Date;
  request_args: any;
  public parse_request = (request: any) => {
    this.msg_sender = request.metadata.msg_sender;
    this.msg_timestamp = new Date(request.metadata.timestamp);
    const request_payload = JSON.parse(hexToString(request["payload"]));
    this.request_args = request_payload["args"];
  };
  public execute = (request: any): Output | Set<Output> => {
    if (request) {
      this.parse_request(request);
    }
    return new Log("parsing advance state request");
  };
}
class Mint_NFTRoute extends DefaultRoute {
  imgdata!: string;
  constructor() {
    super();
  }

  public execute = (request: any) => {
    this.imgdata = request;
    console.log("request is", request);
    return new Notice(String(request.payload));
  };
}

class WalletRoute extends AdvanceRoute {
  wallet: Wallet;
  rollup_address: any;
  constructor(wallet: Wallet) {
    super();
    this.wallet = wallet;
    this.rollup_address = null;
  }
  public get_rollup_address = () => {
    return this.rollup_address;
  };
  public set_rollup_address = (value: string) => {
    this.rollup_address = value;
  };
}

class DepositEther extends WalletRoute {
  public execute = (request: any) => {
    return this.wallet.ether_deposit_process(request);
  };
}

class DepositERC20Route extends WalletRoute {
  execute = (request: any) => {
    return this.wallet.erc20_deposit_process(request);
  };
}

class DepositERC721Route extends WalletRoute {
  execute = (request: any) => {
    return this.wallet.erc721_deposit_process(request);
  };
}

class BalanceRoute extends WalletRoute {
  public execute = (request: any) => {
    console.log("request is ", request);
    const accbalance = this.wallet.balance_get(getAddress(request));
    console.log("complete balance is", accbalance);
    try {
      const ether = accbalance.ether_get().toString();
      const erc20: Map<`0x${string}`, any> = accbalance.list_erc20();
      let erc20new = new Map();
      let erc721new = new Map();
      const erc721: any = accbalance.list_erc721();
      for (let [key, value] of erc20) {
        erc20new.set(key, value.toString());
      }
      console.log(ether, erc20, erc721);
      for (let [key, value] of erc721) {
        erc721new.set(key, Array.from(value));
      }
      return new Report(
        JSON.stringify({
          ether: ether,
          erc20: Array.from(erc20new),
          erc721: Array.from(erc721new),
        })
      );
    } catch (e) {
      return new Error_out(String(e));
    }
  };
}

class WithdrawEther extends WalletRoute {
  constructor(wallet: Wallet) {
    super(wallet);
    this.rollup_address = null;
  }
  public execute = (request: any): Output => {
    this.parse_request(request);
    if (!this.rollup_address) {
      return new Error_out("DApp address is needed to withdraw the assett");
    }
    return this.wallet.ether_withdraw(
      getAddress(this.rollup_address),
      getAddress(this.msg_sender),
      BigInt(this.request_args.amount)
    );
  };
}

class TransferEther extends WalletRoute {
  public execute = (request: any) => {
    this.parse_request(request);
    return this.wallet.ether_transfer(
      getAddress(this.msg_sender),
      getAddress(this.request_args.to.toLowerCase()),
      BigInt(this.request_args.amount)
    );
  };
}

class WithdrawERC20Route extends WalletRoute {
  constructor(wallet: Wallet) {
    super(wallet);
  }

  public execute = (request: any): Output => {
    this.parse_request(request);
    return this.wallet.erc20_withdraw(
      getAddress(this.msg_sender),
      getAddress(this.request_args.erc20.toLowerCase()),
      BigInt(this.request_args.amount)
    );
  };
}

class TransferERC20Route extends WalletRoute {
  public execute = (request: any): Output => {
    this.parse_request(request);
    return this.wallet.erc20_transfer(
      getAddress(this.msg_sender),
      getAddress(this.request_args.to.toLowerCase()),
      getAddress(this.request_args.erc20.toLowerCase()),
      BigInt(this.request_args.amount)
    );
  };
}

class WithdrawERC721Route extends WalletRoute {
  constructor(wallet: Wallet) {
    super(wallet);
  }
  public execute = (request: any) => {
    this.parse_request(request);
    if (!this.rollup_address) {
      return new Error_out("DApp address is needed to withdraw the assett");
    }
    return this.wallet.erc721_withdraw(
      getAddress(this.rollup_address),
      getAddress(this.msg_sender),
      getAddress(this.request_args.erc721.toLowerCase()),
      parseInt(this.request_args.token_id)
    );
  };
}

class TransferERC721Route extends WalletRoute {
  public execute = (request: any) => {
    this.parse_request(request);
    return this.wallet.erc721_transfer(
      getAddress(this.msg_sender),
      getAddress(this.request_args.to.toLowerCase()),
      getAddress(this.request_args.erc721.toLowerCase()),
      parseInt(this.request_args.token_id)
    );
  };
}

class Router {
  controllers: Map<string, DefaultRoute>;
  constructor(wallet: Wallet) {
    this.controllers = new Map();
    this.controllers.set("ether_deposit", new DepositEther(wallet));
    this.controllers.set("erc20_deposit", new DepositERC20Route(wallet));
    this.controllers.set("erc721_deposit", new DepositERC721Route(wallet));
    this.controllers.set("balance", new BalanceRoute(wallet));
    this.controllers.set("ether_withdraw", new WithdrawEther(wallet));
    this.controllers.set("ether_transfer", new TransferEther(wallet));
    this.controllers.set("erc20_withdraw", new WithdrawERC20Route(wallet));
    this.controllers.set("erc20_transfer", new TransferERC20Route(wallet));
    this.controllers.set("erc721_withdraw", new WithdrawERC721Route(wallet));
    this.controllers.set("erc721_transfer", new TransferERC721Route(wallet));
    this.controllers.set("create_nft", new Mint_NFTRoute());
  }
  addRoute(name: string, method: DefaultRoute) {
    this.controllers.set(name, method);
  }
  set_rollup_address(rollup_address: string, method: string) {
    const controller = <WalletRoute>this.controllers.get(method);
    controller.set_rollup_address(rollup_address);
  }

  process(route: string, request: any) {
    route = route.toLowerCase();
    const controller = this.controllers.get(route);
    if (!controller) {
      return new Error_out(`operation ${route} is not supported`);
    }
    console.info(`executing operation ${route}`);
    return controller.execute(request);
  }
}
export { Router };
