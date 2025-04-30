---
title: Understanding `.call`, Member Method Calls, `.delegatecall`, `.staticcall` and assembly `call`
date: 2025-04-29
keywords: solidity, call, delegatecall, staticcall
---

In Solidity, different ways of calling contracts represent different behaviors at the EVM level. Understanding their differences is critical to writing secure and efficient smart contracts.

![5 different ways of calling contracts](/resources/solidity-calls/thumb.jpg)

## 🤷‍♂️ TL;DR

- `.call`: Flexible but dangerous low-level call.
- Member call: Safe and easy Solidity wrapper around `.call`.
- `.delegatecall`: Borrow another contract's logic but operate on **your own storage**.
- `.staticcall`: Safe read-only call, guaranteed no state modification.

---

## 📜 1. `.call`

- A low-level EVM instruction.
- Directly calls **another contract** at a **different address**.
- **Executes using the target contract’s code and the target contract’s own storage**.
- Can send ETH along with the call.
- Minimal safety: no type checking, no automatic error handling — you must manually check the return values.

```solidity
(bool success, bytes memory returnData) = targetAddress.call{value: 0}(data);
```

✅ Runs with **the target's code** and **the target's storage**.  
✅ Supports sending ETH.  
✅ It's the most fundamental way of cross-contract interaction.

⚡ **Major Risk**: You must manually check `success`, or risk unexpected failures.

## 📜 2. High-Level Solidity Call (Member Method Call)

When you write:

```solidity
MyContract(targetAddress).myMethod(args);
```

- Solidity automatically **encodes the arguments** into ABI format (`abi.encodeWithSelector(...)`).
- Under the hood, it still uses `.call`, but wraps it with:
  - Automatic `require(success, "Failed")`
  - Automatic decoding of return values
  - Type-safe interfaces
- If the call fails, it **reverts automatically** with the proper error message.

✅ Safer and easier to write.  
⚠️ Slightly **more gas-expensive** due to extra type checking and error handling.

## 📜 3. `.delegatecall`

- Another low-level EVM instruction.
- **Executes the target contract’s code but uses the caller’s storage, caller’s balance, and caller’s address**.
- The target contract simply provides **code**; **storage and context remain with the caller**.

```solidity
(bool success, bytes memory data) = targetAddress.delegatecall(data);
```

✅ Commonly used for **proxy contracts**, **plugin systems**, and **upgradable contracts**.  
⚡ Very dangerous if misused: a bad call could **corrupt your contract's storage layout**.

Think of `.delegatecall` as "**borrowing the target’s code and running it as if it was ME**."

## 📜 4. `.staticcall`

- Similar to `.call`, but **read-only**.
- Guarantees that **no state-changing operations** can happen.
- If the target contract tries to modify state, emit events, or send ETH — it will **revert**.

```solidity
(bool success, bytes memory data) = targetAddress.staticcall(data);
```

✅ Used for safely calling **view** and **pure** functions across contracts.  
✅ Enforces strict immutability: no writes, no events, no state changes.

---

## 5. Bonus: Assembly `call`

Uniswap uses assembly `call` to removes the overhead for gas-efficiency.

```solidity
/// @notice performs a hook call using the given calldata on the given hook that doesn't return a delta
/// @return result The complete data returned by the hook
function callHook(IHooks self, bytes memory data) internal returns (bytes memory result) {
  bool success;
  assembly ("memory-safe") {
      success := call(gas(), self, 0, add(data, 0x20), mload(data), 0, 0)
  }
  // Revert with FailedHookCall, containing any error message to bubble up
  if (!success) CustomRevert.bubbleUpAndRevertWith(address(self), bytes4(data), HookCallFailed.selector);

  // The call was successful, fetch the returned data
  assembly ("memory-safe") {
      // allocate result byte array from the free memory pointer
      result := mload(0x40)
      // store new free memory pointer at the end of the array padded to 32 bytes
      mstore(0x40, add(result, and(add(returndatasize(), 0x3f), not(0x1f))))
      // store length in memory
      mstore(result, returndatasize())
      // copy return data to result
      returndatacopy(add(result, 0x20), 0, returndatasize())
  }

  // Length must be at least 32 to contain the selector. Check expected selector and returned selector match.
  if (result.length < 32 || result.parseSelector() != data.parseSelector()) {
      InvalidHookResponse.selector.revertWith();
  }
}

/// @notice performs a hook call using the given calldata on the given hook
/// @return int256 The delta returned by the hook
function callHookWithReturnDelta(IHooks self, bytes memory data, bool parseReturn) internal returns (int256) {
  bytes memory result = callHook(self, data);

  // If this hook wasn't meant to return something, default to 0 delta
  if (!parseReturn) return 0;

  // A length of 64 bytes is required to return a bytes4, and a 32 byte delta
  if (result.length != 64) InvalidHookResponse.selector.revertWith();
  return result.parseReturnDelta();
}
```

_Source code: [Hooks.sol](https://github.com/Uniswap/v4-core/blob/a7cf038cd568801a79a9b4cf92cd5b52c95c8585/src/libraries/Hooks.sol#L131)_
