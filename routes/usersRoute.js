// routes>usersRoute.js

const express = require("express");
const bcrypt = require('bcrypt'); // <= bcrypt
const router = express.Router();

// Middleware
const authMiddleware = require("../middleware/authMiddleware.js");

// JWT
const jwt = require("jsonwebtoken")
// Model
const { Users, UserInfos } = require("../models")

const { Op } = require('sequelize');

// 회원가입 API (POST)
router
  .post("/signup", async (req, res) => {
    const { email, nickname, password, confirm } = req.body;
    const existUserEmail = await Users.findOne({ where: { email } });
    const exitsUserNickname = await UserInfos.findOne({ where: { nickname } })
    // bcrypt.hash() => 비밀번호를 암호화 합니다.
    const hashedPassword = await bcrypt.hash(password, 10)
    // bcrypt.hash(암호화할 비밀번호, 암호화 복잡성)
    // 암호화 복잡성이 높을수록 암호화에 더 많은 시간이 소요되며, 일반적으로 '10'으로 설정합니다.

    try {
      if (!email) {
        return res.status(412).json({ message: "email의 형식이 올바르지 않습니다." })
      }
      if (existUserEmail) {
        return res.status(412).json({ message: "중복된 email입니다." })
      }
      if (!nickname || nickname.length < 3 || !/^[a-z A-Z 0-9]+$/.test(nickname)) {
        // 3번째 조건은 정규 표현식이며, '^'은 문자열 시작, '$'은 문자열 끝을 나타냅니다.
        // test() method는 이 정규 표현식을 'nickname' 문자열에 적용하여, 앞에 조건이 일치하는지 여부를 반환합니다.
        return res.status(412).json({ message: "nickname의 형식이 올바르지 않습니다." })
      }
      if (exitsUserNickname) {
        return res.status(412).json({ message: "중복된 nickname입니다." });
      }
      if (!password || password.length < 4 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/.test(password)) {
        // 3번째 조건은, 비밀번호가 영어 소문자, 대문자, 숫자를 각각 최소 1개 이상 포함해야 함을 나타냅니다.
        return res.status(412).json({ message: "password 형식이 올바르지 않습니다." })
      }
      if (password !== confirm) {
        return res.status(412).json({ message: "password가 일치하지 않습니다." })
      }
      if (password.includes(nickname)) {
        return res.status(412).json({ message: "password에 nickname이 포함되어 있습니다." })
      }
      // Users(table), UserInfos(table)에 사용자 정보를 추가합니다.
      // password를 암호화된 password(hashedPassword)로 설정해서 create합니다.
      const user = await Users.create({ email, password: hashedPassword })
      const userInfo = await UserInfos.create({
        userId: user.userId,
        email: email,
        nickname: nickname,
        password: password,
        userDesc: null
      });
      return res.status(201).json({ message: "회원 가입에 성공하였습니다." });
      // try => catch
    } catch {
      return res.status(400).json({ message: "요청한 Data 형식이 올바르지 않습니다." });
    }
  })

// login API (POST)
router
  .post("/login", async (req, res) => {
    const { email, password } = req.body;
    const existUser = await Users.findOne({ where: { email } });
    const passwordMatch = await bcrypt.compare(password, existUser.password);
    // bcrypt.compare() 함수는 입력된 비밀번호와 암호화되어 저장된 비밀번호(hashedPassword)를 비교합니다.
    // bcrypt.compare(request에 입력된 비밀번호, DataBase에 있는 암호화된 비밀번호)
    // 일치하면 true, 일치하지 않으면 false 값을 반환합니다.
    try {
      if (!existUser || !passwordMatch) {
        return res.status(412).json({ message: "email 또는 password를 확인해주세요." });
      }

      // JWT 생성
      const token = jwt.sign({
        userId: existUser.userId
      }, "customized_secret_key"); // Secret Key => customized_secret_key

      // Cookie 발급
      res.cookie("authorization", `Bearer ${token}`);

      return res.status(200).json({ "token": token });
      // try => catch
    } catch {
      return res.status(400).json({ message: "log-in에 실패하였습니다." });
    }
  })

// 사용자 정보 조회 API (GET)
router
  .get("/users/:userId", authMiddleware, async (req, res) => {
    const paramsUserId = req.params.userId; // from params, type: string
    const { userId } = res.locals.user; // from authMiddleware, type: number

    try {
      if (paramsUserId !== String(userId)) {
        return res.status(403).json({ message: "권한이 존재하지 않습니다." });
      } else if (paramsUserId === String(userId)) {
        const user = await Users.findOne({
          attributes: ["userId", "email", "createdAt", "updatedAt"],
          include: [
            {
              model: UserInfos,  // 1:1 관계를 맺고있는 UserInfos(table)를 조회합니다.
              attributes: ["nickname", "userDesc"],
            }
          ],
          where: { userId: paramsUserId }
        });

        return res.status(200).json({ data: user });
      }
      // try => catch
    } catch {
      return res.status(400).json({ message: "사용자 정보 조회에 실패하였습니다." });
    }
  });

// 사용자 정보 수정 API (PUT)
router
  .put("/users/:userId", authMiddleware, async (req, res) => {
    const paramsUserId = req.params.userId;
    const { userId } = res.locals.user;
    const { password, nickname, userDesc, newPassword, newPasswordConfirm } = req.body;
    const existUser = await Users.findOne({ where: { userId } });
    const exitsUserNickname = await UserInfos.findOne({ where: { nickname } })
    // 암호화 관련
    const passwordMatch = await bcrypt.compare(password, existUser.password);
    const hashedNewPassword = await bcrypt.hash(newPassword, 10)

    try {
      if (paramsUserId !== String(userId)) {
        return res.status(403).json({ message: "권한이 존재하지 않습니다." });
      } else if (paramsUserId === String(userId)) {
        if (!password) {
          return res.status(400).json({ message: "password를 입력해주세요." });
        }
        if (!passwordMatch) {
          return res.status(400).json({ message: "password가 일치하지 않습니다." });
        }
        if (!nickname || nickname.length < 3 || !/^[a-z A-Z 0-9]+$/.test(nickname)) {
          return res.status(412).json({ message: "nickname의 형식이 올바르지 않습니다." })
        }
        if (exitsUserNickname) {
          return res.status(412).json({ message: "중복된 nickname입니다." });
        }
        if (newPassword || newPasswordConfirm) {
          if (newPassword !== newPasswordConfirm) {
            return res.status(412).json({ message: "변경된 password가 일치하지 않습니다." })
          }
          if (!newPassword || newPassword.length < 4 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/.test(password)) {
            return res.status(412).json({ message: "변경된 password 형식이 올바르지 않습니다." })
          }
          if (newPassword.includes(nickname)) {
            return res.status(412).json({ message: "변경된 password에 nickname이 포함되어 있습니다." })
          }
        }

        await Users.update(
          {
            password: hashedNewPassword
          }, { where: { userId } }
        )
        await UserInfos.update(
          {
            nickname: nickname,
            userDesc: userDesc
          }, { where: { userId } }
        )

        return res.status(200).json({ message: "사용자 정보 수정에 성공하였습니다." });
      }
      // try => catch
    } catch {
      return res.status(400).json({ message: "사용자 정보 조회에 실패하였습니다." });
    }
  })

// 회원탈퇴 API (DELETE)
router
  .delete("/users/:userId", authMiddleware, async (req, res) => {
    const paramsUserId = req.params.userId;
    const { userId } = res.locals.user;
    const { email, password } = req.body;
    const existUser = await Users.findOne({ where: { userId } });
    // 암호화 관련
    const passwordMatch = await bcrypt.compare(password, existUser.password);

    try {
      if (paramsUserId !== String(userId)) {
        return res.status(403).json({ message: "권한이 존재하지 않습니다." });
      } else if (paramsUserId === String(userId)) {
        if (!email) {
          return res.status(412).json({ message: "email을 입력해주세요." });
        }
        if (!password) {
          return res.status(412).json({ message: "password를 입력해주세요." });
        }
        if (email !== existUser.email || !passwordMatch) {
          return res.status(412).json({ message: "email 또는 password를 확인해주세요." });
        }

        await Users.destroy({
          where: {
            [Op.and]: [{ userId }, { email: existUser.email }]
          }
        })

        return res.status(200).json({ message: "사용자 정보 삭제에 성공하였습니다." });
      }
      // try => catch
    } catch {
      return res.status(400).json({ message: "사용자 정보 조회에 실패하였습니다." });
    }
  })

module.exports = router;
