---
title: 远离Google和Chrome?
date: 2019-02-06
keywords: javascript, promise, nodejs, node.js, macrotask, microtask, blockage
---

最近我发现我的 Google Map Timeline 数据被 google 清除了。

我的 Google Map Timeline 记录了我过去所有的摩旅路线 —— 苏格兰，西班牙，瑞士，欧洲大陆，冰岛，还有不计其数的非摩旅的路线。

![是否应该远离Google和Chrome?](/resources/google-crl/google-crl.png)

当时真的没有想到过 Google 能做出如此不专业的行为，我一直是 Google 各种服务的付费用户。以我以往的经验，Google 每次 shutdown 服务，都会提供 Data Takeout 功能，让用户下载，比如之前的 google code。

然而这次 Google 所做的仅仅是在 30/11/2024 那天开始，每隔一段时间给我的邮箱发送一个“Reminder"邮件。如果不在 6/4/2025 之前设置好 timeline 数据行为，就默认完全删除。而这些邮件呢，又分类在 Gmail 的“Update”标签里头，混杂了一堆无关紧要的论坛更新信息，我压根就没看到。等到 26/4/2025 那天，我才发现 timeline 全都不见了。

当时真的非常非常生气，给 google map 发了 feedback，但并不对恢复数据抱什么希望。

碰巧刚才又看了 Knowledge Noise 的视频：https://www.youtube.com/watch?v=XfEYE4wgnzw

视频在 25:48 说到“避免使用 Chrome 和 Opera 这类对抗追踪比较弱的浏览器”，我其实不太明白这里的“对抗追踪”具体指什么，为何 Chrome 会比较弱，以及为何会和视频的主题有联系。但视频在 21:49 提到 Chrome 其实过去有个问题，那就是但一个网站的 certificate 被 revoke 后，它貌似更长一段时间都反应不过来。甚至[视频里面的引用的文章](https://www.schrauger.com/the-story-of-how-wosign-gave-me-an-ssl-certificate-for-github-com)提到，一年以后还能继续访问证书被 revoke 的网站。

这让我联系起 Timeline 删除的事情，隐隐有一种 Google 其实也不是那么靠谱的感觉。

但网络上的内容，尤其是视频中没有说到细节的情况，还是需要自己调查验证一下会比较好，如果他们说的是真实的，那就不用 Chrome 了，如果不是的话，那至少目前使用 Chrome 还暂时可以放心，但也要逐渐远离 Google 的其他非付费服务了，比如 Chrome 的书签和密码还有 2fa authenticator 服务，谁知道会不会哪一天突然说停就停了。

不过呢，经过一番调查发现其实这问题有点复杂，Chrome 目前我个人理解下来没有太大的问题。这里简单记录一下，以备以后我自己回来查看。

首先一般浏览器在对付 Revocation List 的时候，会采用两种策略：

1. 一种就是 OCSP(Online Certificate Status Protocol)以及 OCSP 的增加版 OCSP Stapling。OCSP 简而言就是浏览器会在访问网站时，向 CA 请求证书吊销信息，然后如果浏览器发现某个网站的证书被吊销了，就会拒绝访问。OCSP Stapling 则是将这个流程易到了网站的服务器端，由网站的服务器来向 CA 请求证书吊销信息，配合 CA 的签名返回给浏览器。
2. 另一种则是手工或者自动的维护一个 CRL(Certificate Revocation List)的列表。这个列表通过一定的策略更新到浏览器本地，这样浏览器访问网站时只需要在本地查询这个列表即可。
   1. Chrome 的列表功能叫做[CRLSets](https://www.chromium.org/Home/chromium-security/crlsets/)
   2. 而 Firefox 目前的系统则是 CRLite。
   3. Safari 则只有 OCSP 和 OCSP Stapling。

Chrome 之前被人诟病的主要原因，是因为 Chrome 在 version 19 的时候就默认关闭了 OCSP（可以手工打开），只使用 CRLSets，而这个 CRLSets 的更新根据上面文章的描述，取决于：

1. Google 工程师手动更新列表。
2. CRLSets 列表由每次浏览器更新时才更新到用户本地。

因此呢，如果一个网站的证书被吊销了，Chrome 在短时间内还是会访问这个网站，直到 google 工程师和用户同时做了相应的更新为止。
同时呢，上面的文字还指出其实 CRLSets 的列表仅仅占所有的吊销证书的 0.877%。

至于 CRLSets 现在的覆盖率是多少我找不到数据，但是貌似这个更新的问题应该是已经解决了，根据[Chromium 自己网站的说法](https://www.chromium.org/Home/chromium-security/crlsets/)：

> CRLs on the list are fetched infrequently (at most once every few hours) and verified against the correct signing certificate for that CRL. A subset of the certificates identified as revoked on these CRLs are included in the current CRLSet.

而 Chrome 和 Edge 选择关闭 OCSP 的原因是，OCSP 其实也不靠谱。根据[Mozilla 的这篇文章](https://blog.mozilla.org/security/2020/01/09/crlite-part-1-all-web-pki-revocations-compressed/)和[这篇文章](https://www.gradenegger.eu/en/google-chrome-does-not-check-revocation-status-of-certificates/)，7% OCSP 请求会超时，总共 10%的 OCSP 请求无效。而使用非 Stapling 的 OCSP 请求，还会导致浏览器性能问题，因为在 OCSP 请求的时候，浏览器都不能做，只能干等。在 OCSP 无效请求后，所有浏览器都会使用 soft fail 策略，也就是默认认为证书是有效的。

下面 👇 是 google 的说法：

> In light of the fact that soft-fail, online revocation checks provide no effective security benefit, they are disabled by default in Google Chrome version 19 and later. By setting this policy to true, the previous behavior is restored and online OCSP/CRL checks will be performed.
> If the policy is not set, or is set to false, then Google Chrome will not perform online revocation checks in Google Chrome 19 and later.
>
> - https://www.chromium.org/administrators/policy-list-3#EnableOnlineRevocationChecks

所以呢，其实吧，Safari 这种只有 OCSP 的浏览器，显然也不是那么靠谱。剩下的真的很看 CRL 列表的覆盖率和更新频率了。
