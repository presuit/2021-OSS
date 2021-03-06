import { DB_COLLECTIONS } from "../../utils/constants";
import {
  query,
  where,
  collection,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import {
  authService,
  createDocument,
  dbService,
  deleteDocument,
  getDocument,
  queryDocument,
  storageService,
  updateDocument,
} from "./firebase";
import {
  ref,
  deleteObject,
  getDownloadURL,
  uploadString,
} from "firebase/storage";
import { v4 as uuid } from "uuid";

import { updatePassword, updateProfile } from "@firebase/auth";

//현재 로그인 한 유저정보를 불러오는 함수.
export const getUser = async () => {
  let user = null;
  if (authService.currentUser) {
    const userQuery = query(
      collection(dbService, DB_COLLECTIONS.USER),
      where("uid", "==", authService.currentUser.uid)
    );
    const result = await getDocs(userQuery);

    for (const item of result.docs) {
      if (item.exists()) {
        user = item.data();
      }
    }
  }
  return user;
};

export const getUserByUid = async (uid) => {
  if (!uid || uid === "") {
    return null;
  }
  try {
    const q = query(
      collection(dbService, DB_COLLECTIONS.USER),
      where("uid", "==", uid)
    );
    const queryResult = await getDocs(q);

    for (const docRef of queryResult.docs) {
      if (docRef.exists()) {
        return docRef.data();
      }
    }

    return null;
  } catch (error) {
    console.log(error);
    return null;
  }
};

//해당 communityPost가 현재 로그인 한 유저의 것인지 파악하는 함수
export const isPostMine = (user, postId) => {
  const userPosts = user["postIds"];
  if (userPosts && Array.isArray(userPosts)) {
    const targetPostId = userPosts.find((userPostId) => userPostId === postId);
    if (!targetPostId) {
      return false;
    }
    return true;
  }

  return false;
};

//여러 communityPost들을 db로부터 불러 오는 함수
export const getCommunityPosts = async (type) => {
  try {
    const container = [];
    const result = await getDocs(
      query(collection(dbService, DB_COLLECTIONS.COMMUNITY_POST))
    );

    for (const item of result.docs) {
      if (item.exists()) {
        container.push(item.data());
      }
    }

    if (type == 1) return container.sort((a, b) => b.createdAt - a.createdAt);
    else if (type == 2) return container.sort((a, b) => b.views - a.views);
  } catch (error) {
    console.log(error);
    return [];
  }
};

export const getPost = async (postId) => {
  try {
    let post = null;
    const docRef = doc(dbService, `${DB_COLLECTIONS.COMMUNITY_POST}/${postId}`);
    const docData = await getDoc(docRef);
    if (docData.exists()) {
      post = docData.data();
    }
    return post;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const deleteImgFromFirebase = async (url) => {
  console.log(url);
  try {
    const imgRef = ref(storageService, url);
    if (imgRef) {
      await deleteObject(imgRef);
    }
  } catch (error) {
    console.log(error);
  }
};

export const createCommunityPost = async (data) => {
  const { title, postBody, imgUrlList } = data;
  const user = await getUser();

  try {
    if (!Boolean(title) || !Boolean(postBody)) {
      return {
        ok: false,
        error: "인자로 적절한 값이 들어오지 않았습니다.",
      };
    }

    if (user == null) {
      return {
        ok: false,
        error: "현재 유저가 로그인하고 있지 않습니다.",
      };
    }

    const postData = {
      id: uuid(),
      title,
      postBody,
      creatorId: user.uid,
      commentIds: [],
      imgUrls: imgUrlList ? imgUrlList : [],
      views: 0,
      likes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    };

    const {
      error,
      id: FBdocumentId,
      ok,
    } = await createDocument(DB_COLLECTIONS.COMMUNITY_POST, postData);

    if (!ok || error !== null) {
      return {
        ok: false,
        error: "파이어베이스에 정상적으로 도큐먼트를 생성하지 못했습니다.",
        postId: null,
      };
    }

    await updateDocument(DB_COLLECTIONS.COMMUNITY_POST, FBdocumentId, {
      id: FBdocumentId,
    });

    await updateDocument(DB_COLLECTIONS.USER, user.id, {
      postIds: [...user.postIds, FBdocumentId],
    });

    return {
      ok: true,
      postId: FBdocumentId,
      error: null,
    };
  } catch (error) {
    console.log(error);
    return {
      ok: false,
      error,
      postId: null,
    };
  }
};

//communityPost를 업데이트 해주는 함수
export const updateCommunityPost = async (postId, data) => {
  try {
    const { title, postBody, imgUrlList, tags } = data;
    const user = await getUser();

    if (!Boolean(postId)) {
      return {
        ok: false,
        error: "postId가 주어지지 않았습니다.",
        postId: null,
      };
    }

    if (user == null) {
      return {
        ok: false,
        error: "해당 기능은 로그인 후에 이용할 수 있습니다.",
        postId: null,
      };
    }

    const myPost = isPostMine(user, postId);
    if (!myPost) {
      return {
        ok: false,
        error: "유저에게 해당 포스트를 수정할 권한이 없습니다.",
        postId: null,
      };
    }

    const updateData = {
      ...(title && { title }),
      ...(postBody && { postBody }),
      ...(imgUrlList && { imgUrlList }),
      ...(tags && { tags }),
    };

    const { error, ok } = await updateDocument(
      DB_COLLECTIONS.COMMUNITY_POST,
      postId,
      updateData
    );

    if (!ok || error) {
      return {
        ok,
        error,
        postId: null,
      };
    }

    return {
      ok: true,
      error: null,
      postId,
    };
  } catch (error) {
    console.log(error);
    return { ok: false, error, postId: null };
  }
};

//communityPost를 delete 해주는 함수
export const deleteCommunityPost = async (postId) => {
  try {
    const user = await getUser();

    if (user == null) {
      return {
        ok: false,
        error: "해당 기능은 로그인 후에 사용할 수 있습니다.",
      };
    }

    const myPost = isPostMine(user, postId);
    if (!myPost) {
      return {
        ok: false,
        error: "유저에게 해당 포스트를 수정할 권한이 없습니다.",
      };
    }

    const { error, ok } = await deleteDocument(
      DB_COLLECTIONS.COMMUNITY_POST,
      postId
    );

    if (!ok || error) {
      return {
        ok,
        error,
      };
    }

    const filteredPostIds = user.postIds.filter((elem) => elem !== postId);
    await updateDocument(DB_COLLECTIONS.USER, user.id, {
      postIds: filteredPostIds,
    });

    return { ok: true, error: null };
  } catch (error) {
    console.log(error);
    return {
      ok: false,
      error,
    };
  }
};

export const isLoggedIn = () => {
  return Boolean(authService.currentUser);
};

// user update
export const updateUser = async (uid, data) => {
  const { password, photoURL, displayName } = data;
  if (!isLoggedIn()) {
    return {
      ok: false,
      error: "로그인 하지 않고 사용할 수 없습니다.",
    };
  }
  if (uid !== authService.currentUser.uid) {
    return {
      ok: false,
      error: "인자로 들어온 uid와 현재 로그인 한 유저의 uid가 같지 않습니다.",
    };
  }

  try {
    if (password && typeof password === "string") {
      await updatePassword(authService.currentUser, password);
    }

    const updateData = {
      ...(displayName && typeof displayName === "string" && { displayName }),
      ...(photoURL && typeof photoURL === "string" && { photoURL }),
    };
    await updateProfile(authService.currentUser, updateData);

    const { ok, error } = await asyncCurrentUserToFirebase();
    if (!ok || error) {
      return { ok, error };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

export const asyncCurrentUserToFirebase = async () => {
  if (!isLoggedIn()) {
    return { ok: false, error: "로그인 하지 않고 이용할 수 없습니다." };
  }

  try {
    const firebaseUser = await getUser();
    const { displayName, photoURL } = authService.currentUser;
    const data = {
      ...(displayName && { displayName }),
      ...(photoURL && { photoURL }),
    };
    if (Object.keys(data).length > 0) {
      const { error, ok } = await updateDocument(
        DB_COLLECTIONS.USER,
        firebaseUser.id,
        data
      );
      if (!ok || error) {
        return { ok, error };
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
};

export const createComment = async (data) => {
  const { postId, commentBody } = data;

  if (!postId || !commentBody || commentBody.length <= 0) {
    return {
      ok: false,
      error: "data로 들어온 인자가 이상합니다. 확인해 주세요.",
    };
  }

  if (!isLoggedIn()) {
    return { ok: false, error: "로그인 하지 않고 사용할 수 없습니다." };
  }

  try {
    const { documentData, error, ok } = await getDocument(
      DB_COLLECTIONS.COMMUNITY_POST,
      postId
    );

    if (!ok || error) {
      return { ok, error: "해당 postId를 가진 post가 없습니다." };
    }

    const currentUser = await getUser();

    const comment = {
      id: null,
      postId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      commentBody,
      creatorId: currentUser.uid,
    };

    const {
      ok: commentOk,
      error: commentErr,
      id: commentId,
    } = await createDocument(DB_COLLECTIONS.COMMUNITY_COMMENT, comment);

    if (!commentOk || commentErr) {
      return {
        ok: commentOk,
        error: commentErr,
      };
    }

    const { error: commentUpdateErr, ok: commentUpdateOk } =
      await updateDocument(DB_COLLECTIONS.COMMUNITY_COMMENT, commentId, {
        id: commentId,
      });

    if (!commentUpdateOk || commentUpdateErr) {
      return { ok: commentUpdateOk, error: commentUpdateErr };
    }

    const { error: postUpdateErr, ok: postUpdateOk } = await updateDocument(
      DB_COLLECTIONS.COMMUNITY_POST,
      postId,
      {
        commentIds: [...documentData.commentIds, commentId],
      }
    );

    if (postUpdateErr || !postUpdateOk) {
      return {
        ok: postUpdateOk,
        error: postUpdateErr,
      };
    }

    const { error: updateUserErr, ok: updateUserOk } = await updateDocument(
      DB_COLLECTIONS.USER,
      currentUser.id,
      {
        commentIds: [...currentUser.commentIds, commentId],
      }
    );

    if (!updateUserOk || updateUserErr) {
      return { ok: updateUserOk, error: updateUserErr };
    }

    return { ok: true, commentId };
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
};

const isCommentMine = async (commentId) => {
  try {
    if (!isLoggedIn()) {
      return false;
    }

    const currentUser = await getUser();

    const checksum = currentUser.commentIds.find((id) => id === commentId);

    if (!checksum) {
      return false;
    }

    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
};

export const deleteComment = async (postId, commentId) => {
  if (!commentId) {
    return { ok: false, error: "인자로 적절한 값이 들어오지 않았습니다." };
  }

  if (!isLoggedIn()) {
    return { ok: false, error: "로그인 후에 이용 가능합니다." };
  }

  if (!(await isCommentMine(commentId))) {
    return { ok: false, error: "해당 comment에 대한 삭제 권한이 없습니다." };
  }

  try {
    // get post from postid
    const {
      documentData: postData,
      error: posttErr,
      ok: postOk,
    } = await getDocument(DB_COLLECTIONS.COMMUNITY_POST, postId);

    if (!postOk || posttErr) {
      return { ok: postOk, error: posttErr };
    }

    // check comment is in the post
    const commentInPostValidate = postData.commentIds.find(
      (id) => id === commentId
    );
    if (!commentInPostValidate) {
      return {
        ok: false,
        error: "해당 post는 해당 comment를 가지고 있지 않습니다.",
      };
    }

    // delete comment
    const { error, ok } = await deleteDocument(
      DB_COLLECTIONS.COMMUNITY_COMMENT,
      commentId
    );

    if (!ok || error) {
      return { ok, error };
    }

    // update post commentIds without target commentId
    const { error: updatePostErr, ok: updatePostOk } = await updateDocument(
      DB_COLLECTIONS.COMMUNITY_POST,
      postId,
      { commentIds: [...postData.commentIds.filter((id) => id !== commentId)] }
    );

    if (!updatePostOk || updatePostErr) {
      return { ok: updatePostOk, error: updatePostErr };
    }

    //update current User's commentIds without target commentId
    const user = await getUser();
    const { error: updateUserErr, ok: updateUserOk } = await updateDocument(
      DB_COLLECTIONS.USER,
      user.id,
      {
        commentIds: [...user.commentIds.filter((id) => id !== commentId)],
      }
    );

    if (!updateUserOk || updateUserErr) {
      return { ok: updateUserOk, error: updateUserErr };
    }

    return { ok: true };
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
};
export const updateComment = async (postId, commentId, data) => {
  const { commentBody } = data;
  if (!commentId || !commentBody || commentBody.length <= 0) {
    return { ok: false, error: "인자로 적절한 값이 들어오지 않았습니다." };
  }

  if (!isLoggedIn()) {
    return { ok: false, error: "해당 기능은 로그인 후에 이용할 수 있습니다." };
  }

  if (!(await isCommentMine(commentId))) {
    return { ok: false, error: "해당 comment에 대한 변경 권한이 없습니다." };
  }

  try {
    // get post and validate comment
    const {
      documentData: postData,
      error: postErr,
      ok: postOk,
    } = await getDocument(DB_COLLECTIONS.COMMUNITY_POST, postId);

    if (!postOk || postErr) {
      return { ok: false, error: postErr };
    }

    const commentInPostValidate = postData.commentIds.find(
      (id) => id === commentId
    );
    if (!commentInPostValidate) {
      return {
        ok: false,
        error: "해당 comment는 해당 post에 들어 있지 않습니다.",
      };
    }

    // update comment
    const { error, ok } = await updateDocument(
      DB_COLLECTIONS.COMMUNITY_COMMENT,
      commentId,
      { commentBody, updatedAt: Date.now() }
    );

    return { ok, error };
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
};

export const getComments = async (commentIds) => {
  const comments = [];
  if (!Array.isArray(commentIds)) {
    return { ok: false, error: "인자로 들어온 값이 잘못 되었습니다." };
  }

  try {
    for (const commentId of commentIds) {
      const { ok, comment, error } = await getComment(commentId);

      if (!ok || error) {
        return { ok, error };
      }

      comments.push(comment);
    }

    return { ok: true, comments };
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
};

export const getComment = async (commentId) => {
  if (!commentId) {
    return { ok: false, error: "인자로 들어온 값이 잘못 되었습니다." };
  }

  try {
    const {
      documentData: comment,
      error,
      ok,
    } = await getDocument(DB_COLLECTIONS.COMMUNITY_COMMENT, commentId);

    if (!ok || error) {
      return { ok, error };
    }

    return { ok: true, comment };
  } catch (error) {
    return { ok: false, error };
  }
};

export const uploadImg = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject("No file exists");
    }

    const reader = new FileReader();
    reader.onload = async () => {
      console.log("loaded img");
      try {
        const user = await getUser();

        if (!user) {
          reject("Log In first");
        }

        const imgRef = ref(storageService, `${user.uid || uuid()}/${uuid()}`);
        await uploadString(imgRef, reader.result, "data_url");

        const downloadURL = await getDownloadURL(imgRef);

        resolve(downloadURL);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
};

const checkRoomExists = async (me, you) => {
  if (!me || !you) {
    return { ok: false };
  }

  try {
    if (!me.chatRoomIds || !you.chatRoomIds) {
      return { ok: false };
    }

    const myChatRoomIds = me.chatRoomIds;
    const yourChatRoomIds = you.chatRoomIds;

    for (const myChatRoomId of myChatRoomIds) {
      const room = yourChatRoomIds.find((roomId) => roomId === myChatRoomId);
      if (room) {
        return { ok: true, chatRoomId: myChatRoomId };
      }
    }

    return { ok: false };
  } catch (error) {
    console.log(error);
    return { ok: false };
  }
};

// chatRoom API
export const createChatRoom = async (participantId) => {
  if (!isLoggedIn()) {
    return { ok: false, error: "해당 기능은 로그인 후에 이용할 수 있습니다." };
  }
  if (!participantId || typeof participantId !== "string") {
    return { ok: false, error: "인자에 오류가 있습니다." };
  }

  try {
    const currentUser = await getUser();
    const participantUser = await getUserByUid(participantId);

    if (!currentUser || !participantUser) {
      return {
        ok: false,
        error: "내 정보 혹은 상대 유저의 정보가 올바르지 않습니다.",
      };
    }

    // 채팅방 개설 전에 이미 비슷한 채팅방이 있는지 확인한다.
    // 비슷한 채팅방이 있으면 그곳으로 이동시켜주고, 아니면 새로 만들어 준다.
    // 해당 api는 리턴 값으로  채팅방 url을 넘겨 줘야함.
    const { ok, chatRoomId } = await checkRoomExists(
      currentUser,
      participantUser
    );

    if (ok && chatRoomId) {
      alert("이미 존재하는 채팅방입니다.");
      return { ok: true, chatRoomId };
    } else {
      const newChatRoom = {
        id: null,
        participantIds: [currentUser.uid, participantUser.uid],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // create new ChatRoom
      const {
        error,
        id: newChatRoomId,
        ok,
      } = await createDocument(DB_COLLECTIONS.CHAT_ROOM, newChatRoom);

      if (!ok || error) {
        return { ok, error };
      }

      // updateChatRoomId
      const { error: updateNewChatRoomErr, ok: updateNewChatRoomOk } =
        await updateDocument(DB_COLLECTIONS.CHAT_ROOM, newChatRoomId, {
          id: newChatRoomId,
        });

      if (!updateNewChatRoomOk || updateNewChatRoomErr) {
        return { ok: updateNewChatRoomOk, error: updateNewChatRoomErr };
      }

      // update current User chatRoomIds
      const currentUserChatRoomIds = currentUser.chatRoomIds || [];
      const {
        error: updateCurrentUserChatRoomIdsErr,
        ok: updateCurrentUserChatRoomIdsOk,
      } = await updateDocument(DB_COLLECTIONS.USER, currentUser.id, {
        chatRoomIds: [...currentUserChatRoomIds, newChatRoomId],
      });

      if (!updateCurrentUserChatRoomIdsOk || updateCurrentUserChatRoomIdsErr) {
        return {
          ok: updateCurrentUserChatRoomIdsOk,
          error: updateCurrentUserChatRoomIdsErr,
        };
      }

      // update ParticipantUser ChatRoomIds
      const participantUserChatRoomIds = participantUser.chatRoomIds || [];
      const {
        error: updateParticipantUserChatRoomIdsErr,
        ok: updateParticipantUserChatRoomIdsOk,
      } = await updateDocument(DB_COLLECTIONS.USER, participantUser.id, {
        chatRoomIds: [...participantUserChatRoomIds, newChatRoomId],
      });

      if (
        !updateParticipantUserChatRoomIdsOk ||
        updateParticipantUserChatRoomIdsErr
      ) {
        return {
          ok: updateParticipantUserChatRoomIdsOk,
          error: updateParticipantUserChatRoomIdsErr,
        };
      }

      // everything is clear, then return true with newChatRoomId
      return { ok: true, chatRoomId: newChatRoomId };
    }
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
};

export const getChatRooms = async () => {
  if (!isLoggedIn()) {
    return { ok: false, error: "해당 기능은 로그인 후에 이용할 수 있습니다." };
  }

  try {
    const currentUser = await getUser();
    const chatRoomIds = currentUser.chatRoomIds;
    const container = [];

    if (!chatRoomIds) {
      return { ok: true, chatRooms: container };
    }

    for (const chatRoomId of chatRoomIds) {
      const {
        documentData: chatRoom,
        error,
        ok,
      } = await getDocument(DB_COLLECTIONS.CHAT_ROOM, chatRoomId);

      if (!ok || error) {
        return { ok, error };
      }
      container.push(chatRoom);
    }

    return { ok: true, chatRooms: container };
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
};

export const getAllUsers = async () => {
  if (!isLoggedIn()) {
    return null;
  }
  let users = [];
  try {
    const userDocs = await getDocs(collection(dbService, DB_COLLECTIONS.USER));

    for (const userData of userDocs.docs) {
      if (userData.exists()) {
        users.push(userData.data());
      }
    }

    return users.filter((user) => user.uid !== authService.currentUser.uid);
  } catch (error) {
    console.log(error);
    return [];
  }
};

export const getChatRoom = async (chatRoomId) => {
  if (!chatRoomId || typeof chatRoomId !== "string") {
    return { ok: false, error: "인자가 올바르지 않습니다." };
  }
  if (!isLoggedIn()) {
    return { ok: false, error: "해당 기능은 로그인 후에 이용할 수 있습니다." };
  }

  try {
    const {
      documentData: chatRoomData,
      error,
      ok,
    } = await getDocument(DB_COLLECTIONS.CHAT_ROOM, chatRoomId);

    if (!ok || error) {
      return { ok, error };
    }

    return { ok: true, chatRoomData };
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
};

export const createChatMsg = async (chatRoomId, fromId, toId, msgBody) => {
  try {
    if (!isLoggedIn()) {
      throw new Error("로그인 이후 이용 가능합니다.");
    }
    if (!chatRoomId || !fromId || !toId || !msgBody || msgBody.length <= 0) {
      throw new Error("인자가 이상합니다.");
    }

    const chatRoomMsg = {
      id: null,
      fromId,
      toId,
      text: msgBody,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      chatRoomId,
    };
    const {
      error,
      id: chatRoomMsgId,
      ok,
    } = await createDocument(DB_COLLECTIONS.CHAT_ROOM_MSG, chatRoomMsg);

    if (!ok || error) {
      throw new Error(error);
    }

    const { error: updateMsgErr, ok: updateMsgOk } = await updateDocument(
      DB_COLLECTIONS.CHAT_ROOM_MSG,
      chatRoomMsgId,
      {
        id: chatRoomMsgId,
      }
    );

    if (!updateMsgOk || updateMsgErr) {
      throw new Error(updateMsgErr);
    }

    const {
      ok: chatRoomOK,
      chatRoomData,
      error: chatRoomErr,
    } = await getChatRoom(chatRoomId);

    if (!chatRoomOK || chatRoomErr) {
      throw new Error(chatRoomErr);
    }

    const chatRoomMsgs = chatRoomData.msgs || [];
    const { error: updateChatRoomErr, ok: updateChatRoomOk } =
      await updateDocument(DB_COLLECTIONS.CHAT_ROOM, chatRoomId, {
        msgs: [...chatRoomMsgs, chatRoomMsgId],
      });

    if (!updateChatRoomOk || updateChatRoomErr) {
      throw new Error(updateChatRoomErr);
    }

    return { ok: true, chatRoomMsgId };
  } catch (error) {
    console.log(error);
    return { ok: false, error };
  }
};

export const getChatRoomMsg = async (chatRoomMsgId) => {
  try {
    const {
      ok,
      documentData: chatRoomMsg,
      error,
    } = await queryDocument(
      DB_COLLECTIONS.CHAT_ROOM_MSG,
      "id",
      "==",
      chatRoomMsgId
    );

    if (!ok || error) {
      throw new Error(error);
    }

    return { ok: true, chatRoomMsg };
  } catch (error) {
    return { ok: false, error };
  }
};
