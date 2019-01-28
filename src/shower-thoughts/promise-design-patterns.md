---
title: Promise() patterns - Breakable then() chain
date: 2019-01-28
keywords: javascript, promise, patterns
---

I realised recently that I used quite a few repetitive coding patterns that meant to solve certain problems with Promise invovled. I think it would be nice to write them down here, as it will be useful to my future self or potentially anyone who is facing the same problem as I did, I think it would be even nicer to make these patterns into a promise-belt utlity library but I don't have time to fully go through it yet... so here we go:

TLDR: Use `throw PromiseResult(result)` to break a promise `then` callback chain, is much easier than checking the resolved value in each `then` callback.

# Breakable `then` callback chain

Basically, with `promise()` it allows you to keep chaining async calls with infinite `then()`s, this is very useful as it helps to avoid writing deeply nested callbacks, make the logic much pleasant to look at. 

For example, it is quite often for me to do something like this: fetch data from source 1, if it is what we want then do `postProcess(data)`, if not, try fetch data from source 2 and check again if that is what we want, if it is again, do `postProcess(data)` and so on and on...

it often ends up with code like this:

```javascript
fetchFromSource1()
    .then(function(dataFromSource1){
        if (isItWhatWeWant(dataFromSource1)) {
            return postProcess(dataFromSource1)
        }

        return fetchFromSource2()
            .then(function(dataFromSource2){
                if (isItWhatWeWant(dataFromSource2)) {
                    return postProcess(dataFromSource2)
                }

                return fetchFromSource3()
                    .then(function(dataFromSource3){
                        if (isItWhatWeWant(dataFromSource3)) {
                            return postProcess(dataFromSource2)
                        }

                        return doSomethingElse()
                    }) 
            })
    })
```

As you can see from above, as the number of data source goes up, the code gradually developed into some deeply nested callback hell, it is not just unpleasant to look at, it is also very difficult to understand the logic and you need a very wide screen to see the whole piece of code 🤦.

So I wanted to pull out those nested blocks above by using `then` callback chain to flatten the whole piece, and it goes well at the beginning:

```javascript
Promise
    .resolve()
    .then(function(){
        return fetchFromSource1();
    })
    .then(function firstCallback(dataFromSource1){
        if (isItWhatWeWant(dataFromSource1)) {
            return postProcess(dataFromSource1)
        }

        return fetchFromSource2()
    })
    .then(function secondCallback(dataFromSource2){
        if (isItWhatWeWant(dataFromSource2)) {
            return postProcess(dataFromSource2)
        }

        return fetchFromSource3()
    })
    .then(function thirdCallback(dataFromSource3){
        if (isItWhatWeWant(dataFromSource3)) {
            return postProcess(dataFromSource2)
        }

        return doSomethingElse()
    }) 
```

It looks much better now except it DOES NOT work.

If `dataFromSource1` is the data we want, the `postProcess()` will return a resolved `promise`, which causes `secondCallback` to be called and `postProcess`ed again, do does the `secondCallback` in `thirdCallback`.

So in order to solve that, we make postProcess return a special object and check that object in each callback to avoid unnecessary processing, here is the updated code:

```javascript
const abort = {};
function postProcess(data) {
    ...

    return abort;
}
Promise
    .resolve()
    .then(function(){
        return fetchFromSource1();
    })
    .then(function firstCallback(dataFromSource1){
        if (isItWhatWeWant(dataFromSource1)) {
            return postProcess(dataFromSource1)
        }

        return fetchFromSource2()
    })
    .then(function secondCallback(dataFromSource2){
        if (dataFromSource2 === abort) {
            return abort;
        }
        if (isItWhatWeWant(dataFromSource2)) {
            return postProcess(dataFromSource2)
        }

        return fetchFromSource3()
    })
    .then(function thirdCallback(dataFromSource3){
        if (dataFromSource2 === abort) {
            return abort;
        }
        if (isItWhatWeWant(dataFromSource3)) {
            return postProcess(dataFromSource2)
        }

        return doSomethingElse()
    }) 
```

This time it is working, and it is much friendly to the eyes, but it does come with a downside: for every callback the dev needs to remember checking the resolved value against `abort` object. It is error prone, and later dev who joins the project may not notice it they need to do so.

To make the code less error prone. The pattern I usually use in the project does the opposite, rather than checking the `abort` object in every callback, it throws or reject a `PromiseResult` object, which is the holder of the true resolved value. This way we can use early `rejection` to skip the callback and process the data at the end of the callback chain:

```javascript
function PromiseResult(result) {
    this.result = result;
}

Promise
    .resolve()
    .then(function(){
        return fetchFromSource1();
    })
    .then(function firstCallback(dataFromSource1){
        if (isItWhatWeWant(dataFromSource1)) {
            throw new PromiseResult(dataFromSource1)
        }

        return fetchFromSource2()
    })
    .then(function secondCallback(dataFromSource2){
        if (isItWhatWeWant(dataFromSource1)) {
            throw new PromiseResult(dataFromSource1)
        }

        return fetchFromSource3()
    })
    .then(function thirdCallback(dataFromSource3){
        if (isItWhatWeWant(dataFromSource1)) {
            throw new PromiseResult(dataFromSource1)
        }
    })
    .then(function(){
        return doSomethingElse()
    }, function(errOrResult){
        if (errOrResult instanceof PromiseResult) {
            return postProcess(errOrResult.result)
        }

        throw errOrResult
    });
```

Now that is much better, I know some of you might not like the bits where it `throw`s, as it comes with performance penalties, but you can always substitute them into `return Promise.reject`.
