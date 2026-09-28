// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Lets a Circle agent wallet act as Pandock's operator. The Circle CLI can only pass flat arguments
/// (address, uint, bytes), not arrays or tuples, so the agent sends pre-encoded calldata here and this
/// forwards it. It holds no funds and can only reach the two contracts fixed at deploy.
contract AgentForwarder {
    address public immutable agent;
    address public immutable pandock;
    address public immutable market;

    error NotAgent();
    error NotTarget();

    constructor(address agent_, address pandock_, address market_) {
        (agent, pandock, market) = (agent_, pandock_, market_);
    }

    function forward(address target, bytes calldata data) external returns (bytes memory ret) {
        if (msg.sender != agent) revert NotAgent();
        if (target != pandock && target != market) revert NotTarget();
        bool ok;
        (ok, ret) = target.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret)) // bubble the target's own error
            }
        }
    }
}
